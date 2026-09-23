#!/usr/bin/env python3
"""
drive_wiki_sync.py

Scans a Google Drive folder for PDFs, organized by subfolder, and builds/updates
a single JSON file (also stored in Drive) that serves as the data foundation
for a wiki.

Behavior:
    - Each immediate subfolder of SOURCE_ROOT_FOLDER_ID becomes a top-level
      heading in the JSON.
    - Every PDF directly inside that subfolder becomes an entry under that heading.
    - The script is incremental: it downloads the existing JSON from Drive first
      (if present) and only re-extracts text for PDFs that are new or whose
      modifiedTime has changed since the last run. Entries for deleted PDFs and
      headings for deleted/emptied folders are pruned.
    - Safe to run on any schedule (morning, nightly, both) — each run just
      reconciles the JSON against current Drive state.

Usage:
    python3 drive_wiki_sync.py            # normal incremental run
    python3 drive_wiki_sync.py --full     # force re-extraction of every PDF
    python3 drive_wiki_sync.py --dry-run  # show what would change, don't upload
"""

import argparse
import io
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import os
import pdfplumber

SCOPES = ["https://www.googleapis.com/auth/drive"]
MIME_FOLDER = "application/vnd.google-apps.folder"
MIME_PDF = "application/pdf"


# --------------------------------------------------------------------------
# Setup / config
# --------------------------------------------------------------------------

def load_config():
    from dotenv import load_dotenv
    load_dotenv()
    required = ["GOOGLE_CREDENTIALS_FILE", "SOURCE_ROOT_FOLDER_ID", "OUTPUT_FOLDER_ID"]
    cfg = {k: os.environ.get(k) for k in required}
    missing = [k for k, v in cfg.items() if not v]
    if missing:
        sys.exit(f"Missing required config in .env: {', '.join(missing)}")
    cfg["OUTPUT_FILENAME"] = os.environ.get("OUTPUT_FILENAME", "wiki_data.json")
    cfg["LOCAL_BACKUP_PATH"] = os.environ.get("LOCAL_BACKUP_PATH") or None
    cfg["LOG_FILE"] = os.environ.get("LOG_FILE") or None
    return cfg


def setup_logging(log_file):
    handlers = [logging.StreamHandler(sys.stdout)]
    if log_file:
        handlers.append(logging.FileHandler(log_file))
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=handlers,
    )


def get_drive_service(credentials_file):
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    creds = service_account.Credentials.from_service_account_file(
        credentials_file, scopes=SCOPES
    )
    return build("drive", "v3", credentials=creds)


# --------------------------------------------------------------------------
# Drive helpers
# --------------------------------------------------------------------------

def list_children(service, folder_id, mime_type=None, page_size=1000):
    """List direct children of a Drive folder, optionally filtered by mimeType."""
    query = f"'{folder_id}' in parents and trashed = false"
    if mime_type:
        query += f" and mimeType = '{mime_type}'"
    items = []
    page_token = None
    while True:
        resp = service.files().list(
            q=query,
            spaces="drive",
            fields="nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink)",
            pageSize=page_size,
            pageToken=page_token,
        ).execute()
        items.extend(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return items


def download_file_bytes(service, file_id):
    from googleapiclient.http import MediaIoBaseDownload
    request = service.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    buf.seek(0)
    return buf.read()


def extract_pdf_text(pdf_bytes):
    text_parts = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text_parts.append(page_text)
    return "\n\n".join(text_parts).strip()


def find_output_file(service, output_folder_id, filename):
    query = (
        f"'{output_folder_id}' in parents and trashed = false "
        f"and name = '{filename}'"
    )
    resp = service.files().list(q=query, spaces="drive", fields="files(id, name)").execute()
    files = resp.get("files", [])
    return files[0]["id"] if files else None


def download_existing_json(service, file_id):
    try:
        raw = download_file_bytes(service, file_id)
        return json.loads(raw.decode("utf-8"))
    except Exception as e:
        logging.warning(f"Could not parse existing JSON, starting fresh: {e}")
        return {}


def upload_json(service, output_folder_id, filename, existing_file_id, data):
    from googleapiclient.http import MediaIoBaseUpload
    payload = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
    media = MediaIoBaseUpload(io.BytesIO(payload), mimetype="application/json", resumable=True)
    if existing_file_id:
        service.files().update(fileId=existing_file_id, media_body=media).execute()
        logging.info(f"Updated existing JSON file (id={existing_file_id}) in Drive.")
    else:
        metadata = {"name": filename, "parents": [output_folder_id], "mimeType": "application/json"}
        created = service.files().create(body=metadata, media_body=media, fields="id").execute()
        logging.info(f"Created new JSON file (id={created['id']}) in Drive.")


# --------------------------------------------------------------------------
# Core sync logic
# --------------------------------------------------------------------------

def sync(service, cfg, force_full=False, dry_run=False):
    root_id = cfg["SOURCE_ROOT_FOLDER_ID"]
    output_folder_id = cfg["OUTPUT_FOLDER_ID"]
    filename = cfg["OUTPUT_FILENAME"]

    existing_file_id = find_output_file(service, output_folder_id, filename)
    existing_data = {} if force_full or not existing_file_id else download_existing_json(service, existing_file_id)

    subfolders = list_children(service, root_id, mime_type=MIME_FOLDER)
    logging.info(f"Found {len(subfolders)} heading folder(s) under root.")

    new_data = {}
    stats = {"unchanged": 0, "updated": 0, "added": 0, "removed": 0, "failed": 0, "errors": []}

    seen_headings = set()
    for folder in subfolders:
        heading = folder["name"]
        seen_headings.add(heading)
        pdfs = list_children(service, folder["id"], mime_type=MIME_PDF)
        heading_data = {}
        existing_heading = existing_data.get(heading, {})

        seen_files = set()
        for pdf in pdfs:
            fname = pdf["name"]
            seen_files.add(fname)
            prior = existing_heading.get(fname)

            if prior and prior.get("file_id") == pdf["id"] and prior.get("modified_time") == pdf["modifiedTime"]:
                heading_data[fname] = prior
                stats["unchanged"] += 1
                continue

            logging.info(f"Extracting: {heading}/{fname}")
            try:
                pdf_bytes = download_file_bytes(service, pdf["id"])
                text = extract_pdf_text(pdf_bytes)
            except Exception as e:
                logging.error(f"Failed to extract {heading}/{fname}: {e}")
                stats["failed"] += 1
                stats["errors"].append(f"{heading}/{fname}: {e}")
                if prior:
                    heading_data[fname] = prior  # keep last good copy
                continue

            heading_data[fname] = {
                "file_id": pdf["id"],
                "modified_time": pdf["modifiedTime"],
                "drive_link": pdf.get("webViewLink", ""),
                "content": text,
                "extracted_at": datetime.now(timezone.utc).isoformat(),
            }
            stats["updated" if prior else "added"] += 1

        removed = set(existing_heading.keys()) - seen_files
        stats["removed"] += len(removed)
        if removed:
            logging.info(f"Removing {len(removed)} deleted file(s) from '{heading}': {sorted(removed)}")

        new_data[heading] = heading_data

    removed_headings = set(existing_data.keys()) - seen_headings
    if removed_headings:
        logging.info(f"Removing {len(removed_headings)} deleted heading(s): {sorted(removed_headings)}")

    logging.info(
        f"Sync summary — added: {stats['added']}, updated: {stats['updated']}, "
        f"unchanged: {stats['unchanged']}, removed: {stats['removed']}"
    )

    if cfg["LOCAL_BACKUP_PATH"]:
        Path(cfg["LOCAL_BACKUP_PATH"]).write_text(
            json.dumps(new_data, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        logging.info(f"Wrote local backup to {cfg['LOCAL_BACKUP_PATH']}")

    if dry_run:
        logging.info("Dry run — not uploading to Drive.")
    else:
        upload_json(service, output_folder_id, filename, existing_file_id, new_data)

    return new_data, stats


def sync_manifest(manifest, existing_data=None, force_full=False):
    """Run the same incremental reconciliation against a local Drive manifest.

    The API adapter owns OAuth, Drive listing, and downloading. This function
    deliberately owns comparison, PDF extraction, pruning, and summary stats.
    Each file entry must include id, name, modified_time, and local_path when
    extraction is needed.
    """
    existing_data = {} if force_full else (existing_data or {})
    new_data = {}
    stats = {"unchanged": 0, "updated": 0, "added": 0, "removed": 0, "failed": 0, "errors": []}
    all_prior = [
        item
        for heading in existing_data.values()
        if isinstance(heading, dict)
        for item in heading.values()
        if isinstance(item, dict)
    ]
    seen_headings = set()

    for folder in manifest.get("categories", []):
        heading = folder["name"]
        seen_headings.add(heading)
        heading_data = {}
        existing_heading = existing_data.get(heading, {})
        seen_files = set()
        for pdf in folder.get("files", []):
            fname = pdf["name"]
            seen_files.add(fname)
            prior = existing_heading.get(fname)
            if not prior:
                prior = next((item for item in all_prior if item.get("file_id") == pdf["id"]), None)
            modified_time = pdf.get("modified_time") or pdf.get("modifiedTime")
            if (
                prior
                and prior.get("file_id") == pdf["id"]
                and prior.get("modified_time") == modified_time
            ):
                heading_data[fname] = prior
                stats["unchanged"] += 1
                continue

            try:
                local_path = pdf.get("local_path")
                if not local_path:
                    raise ValueError("manifest PDF is missing local_path")
                text = extract_pdf_text(Path(local_path).read_bytes())
            except Exception as e:
                logging.error(f"Failed to extract {heading}/{fname}: {e}")
                stats["failed"] += 1
                stats["errors"].append(f"{heading}/{fname}: {e}")
                if prior:
                    heading_data[fname] = prior
                continue

            heading_data[fname] = {
                "file_id": pdf["id"],
                "modified_time": modified_time,
                "drive_link": pdf.get("drive_link") or pdf.get("webViewLink", ""),
                "content": text,
                "extracted_at": datetime.now(timezone.utc).isoformat(),
            }
            stats["updated" if prior else "added"] += 1

        stats["removed"] += len(set(existing_heading.keys()) - seen_files)
        new_data[heading] = heading_data

    stats["removed"] += len(set(existing_data.keys()) - seen_headings)
    return new_data, stats


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Sync Drive PDFs into a wiki JSON file.")
    parser.add_argument("--full", action="store_true", help="Force re-extraction of every PDF.")
    parser.add_argument("--dry-run", action="store_true", help="Compute changes but don't upload.")
    parser.add_argument("--manifest", help="Local JSON Drive manifest for database-adapter mode.")
    parser.add_argument("--prior-json", help="Prior sync JSON state for manifest mode.")
    parser.add_argument("--result-json", help="Output JSON containing data and stats for manifest mode.")
    args = parser.parse_args()

    logging.info("Starting Drive wiki sync" + (" (full rebuild)" if args.full else ""))
    try:
        if args.manifest:
            manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
            prior = {}
            if args.prior_json and Path(args.prior_json).exists():
                prior = json.loads(Path(args.prior_json).read_text(encoding="utf-8"))
            data, stats = sync_manifest(manifest, prior, force_full=args.full)
            result = {"data": data, "stats": stats}
            if args.result_json:
                Path(args.result_json).write_text(
                    json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
                )
            else:
                print(json.dumps(result, ensure_ascii=False))
            return
        cfg = load_config()
        setup_logging(cfg["LOG_FILE"])
        service = get_drive_service(cfg["GOOGLE_CREDENTIALS_FILE"])
        sync(service, cfg, force_full=args.full, dry_run=args.dry_run)
        logging.info("Sync complete.")
    except Exception:
        logging.exception("Sync failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
