import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { and, eq, sql } from "drizzle-orm";
import { db, settingsTable, wikiArticlesTable, wikiCategoriesTable } from "@workspace/db";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);
const connectors = new ReplitConnectors();
const DRIVE_FOLDER = "application/vnd.google-apps.folder";
const PDF = "application/pdf";
const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const WIKI_DRIVE_SOURCE_SETTING = "wiki_drive_source_folder_id";
const LAST_SUCCESS = "wiki_drive_sync_last_success_at";
const LAST_SUMMARY = "wiki_drive_sync_last_summary";
const LAST_ERROR = "wiki_drive_sync_last_error";
const LAST_STARTED = "wiki_drive_sync_last_started_at";
const LEASE_SETTING = "wiki_drive_sync_lease";
const LEASE_MS = 30 * 60 * 1000;
let syncRunning = false;
type SyncStats = {
  unchanged: number;
  updated: number;
  added: number;
  removed: number;
  failed: number;
  errors: string[];
};

export function normalizeDriveFolderId(input: string, allowRoot = false): string | null {
  const value = input.trim();
  if (allowRoot && value === "root") return "root";
  if (/^[a-zA-Z0-9_-]{10,}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.hostname !== "drive.google.com" && url.hostname !== "www.drive.google.com") return null;
    const match = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? url.searchParams.get("id");
  } catch {
    return null;
  }
}

async function driveGet(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const response = await connectors.proxy("google-drive", `${path}?${query}`, { method: "GET" });
  if (!response.ok) throw new Error(`Google Drive request failed (${response.status})`);
  return response;
}

async function listChildren(parentId?: string, mimeType?: string) {
  const items: Array<Record<string, string>> = [];
  let pageToken: string | undefined;
  do {
    const parentClause = parentId ? `'${parentId.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' in parents` : undefined;
    const q = [parentClause, "trashed = false", ...(mimeType ? [`mimeType = '${mimeType}'`] : [])].filter(Boolean).join(" and ");
    const response = await driveGet("/drive/v3/files", {
      q,
      spaces: "drive",
      pageSize: "1000",
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,size,parents)",
      ...(pageToken ? { pageToken } : {}),
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    const body = await response.json() as { files?: Array<Record<string, string>>; nextPageToken?: string };
    items.push(...(body.files ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return items;
}

async function downloadPdf(fileId: string, directory: string) {
  const response = await driveGet(`/drive/v3/files/${encodeURIComponent(fileId)}`, {
    alt: "media",
    supportsAllDrives: "true",
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error(`PDF exceeds ${MAX_PDF_BYTES} byte limit`);
  const path = resolve(directory, `${fileId}.pdf`);
  await writeFile(path, bytes);
  return path;
}

async function setting(key: string) {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string) {
  const existing = await db.select({ id: settingsTable.id }).from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  if (existing[0]) await db.update(settingsTable).set({ value }).where(eq(settingsTable.id, existing[0].id));
  else await db.insert(settingsTable).values({ key, value });
}

async function acquireLease(runId: string) {
  const expiresAt = new Date(Date.now() + LEASE_MS).toISOString();
  const value = JSON.stringify({ runId, expiresAt });
  const rows = await db.execute(sql`
    INSERT INTO settings (key, value) VALUES (${LEASE_SETTING}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    WHERE COALESCE((settings.value::jsonb ->> 'expiresAt')::timestamptz, now() - interval '1 second') <= now()
    RETURNING value
  `);
  return rows.rows.length > 0;
}

async function releaseLease(runId: string) {
  await db.execute(sql`
    DELETE FROM settings
    WHERE key = ${LEASE_SETTING}
      AND settings.value::jsonb ->> 'runId' = ${runId}
  `);
}

async function renewLease(runId: string) {
  const expiresAt = new Date(Date.now() + LEASE_MS).toISOString();
  const rows = await db.execute(sql`
    UPDATE settings
    SET value = ${JSON.stringify({ runId, expiresAt })}
    WHERE key = ${LEASE_SETTING}
      AND settings.value::jsonb ->> 'runId' = ${runId}
      AND (settings.value::jsonb ->> 'expiresAt')::timestamptz > now()
    RETURNING value
  `);
  return rows.rows.length > 0;
}

async function durableLeaseIsValid() {
  const value = await setting(LEASE_SETTING);
  if (!value) return false;
  try {
    return new Date(JSON.parse(value).expiresAt).getTime() > Date.now();
  } catch {
    return false;
  }
}

function slugify(value: string, id: string) {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "page";
  return `${base}-${id.slice(-8).toLowerCase()}`;
}

async function invokeEngine(manifest: unknown, prior: unknown, full: boolean) {
  const directory = await mkdtemp(resolve(tmpdir(), "wiki-drive-"));
  try {
    const manifestPath = resolve(directory, "manifest.json");
    const priorPath = resolve(directory, "prior.json");
    const resultPath = resolve(directory, "result.json");
    await Promise.all([
      writeFile(manifestPath, JSON.stringify(manifest)),
      writeFile(priorPath, JSON.stringify(prior)),
    ]);
    const candidates = [
      resolve(dirname(fileURLToPath(import.meta.url)), "drive_wiki_sync.py"),
      resolve(process.cwd(), "dist/drive_wiki_sync.py"),
      resolve(process.cwd(), "../../scripts/drive_wiki_sync.py"),
    ];
    const script = candidates.find((candidate) => {
      return existsSync(candidate);
    }) ?? candidates[0];
    await execFileAsync("python3", [script, "--manifest", manifestPath, "--prior-json", priorPath, "--result-json", resultPath, ...(full ? ["--full"] : [])], { timeout: 15 * 60 * 1000, maxBuffer: 1024 * 1024 });
    return JSON.parse(await readFile(resultPath, "utf8")) as { data: Record<string, Record<string, { file_id: string; modified_time: string; drive_link: string; content: string }>>; stats: SyncStats };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function applyResult(runId: string, data: Record<string, Record<string, { file_id: string; modified_time: string; drive_link: string; content: string }>>, manifest: { categories: Array<{ id: string; name: string; files: Array<{ id: string; name: string; modified_time: string; drive_link: string }> }> }) {
  const folders = new Map(manifest.categories.map((c) => [c.name, c]));
  const seenFolderIds = new Set<string>();
  const seenFileIds = new Set<string>();
  await db.transaction(async (tx) => {
    const leaseRows = await tx.execute(sql`
      SELECT value
      FROM settings
      WHERE key = ${LEASE_SETTING}
        AND settings.value::jsonb ->> 'runId' = ${runId}
        AND (settings.value::jsonb ->> 'expiresAt')::timestamptz > now()
      FOR UPDATE
    `);
    if (leaseRows.rows.length === 0) throw new Error("Wiki Drive sync lease was lost before applying changes");
    const managedCategories = await tx.select().from(wikiCategoriesTable).where(and(eq(wikiCategoriesTable.wikiKey, "wiki"), eq(wikiCategoriesTable.driveSyncManaged, true)));
    const managedByFolder = new Map(managedCategories.map((c) => [c.driveFolderId, c]));
    const allCategories = await tx.select().from(wikiCategoriesTable).where(eq(wikiCategoriesTable.wikiKey, "wiki"));
    const managedArticles = await tx.select().from(wikiArticlesTable).where(and(eq(wikiArticlesTable.wikiKey, "wiki"), eq(wikiArticlesTable.driveSyncManaged, true)));
    const articleByFile = new Map(managedArticles.filter((a) => a.driveFileId).map((a) => [a.driveFileId, a]));
    for (const [name, articles] of Object.entries(data)) {
      const folder = folders.get(name);
      if (!folder) continue;
      seenFolderIds.add(folder.id);
      let category = managedByFolder.get(folder.id);
      if (!category) {
        category = allCategories.find((candidate) => !candidate.driveSyncManaged && (candidate.name === name || candidate.slug === slugify(name, folder.id)));
      }
      if (category) {
        await tx.update(wikiCategoriesTable).set({ name, slug: slugify(name, folder.id), driveFolderId: folder.id, driveSyncManaged: true, updatedAt: new Date() }).where(eq(wikiCategoriesTable.id, category.id));
      } else {
        [category] = await tx.insert(wikiCategoriesTable).values({ wikiKey: "wiki", name, slug: slugify(name, folder.id), driveFolderId: folder.id, driveSyncManaged: true, driveSyncCreated: true }).returning();
      }
      for (const [filename, article] of Object.entries(articles)) {
        seenFileIds.add(article.file_id);
        const existing = articleByFile.get(article.file_id);
        const values = { title: filename, slug: slugify(filename.replace(/\.pdf$/i, ""), article.file_id), content: article.content, summary: null, categoryId: category.id, driveFileId: article.file_id, driveSourceUrl: article.drive_link, driveModifiedAt: new Date(article.modified_time), driveSyncManaged: true, updatedAt: new Date() };
        if (existing) await tx.update(wikiArticlesTable).set(values).where(eq(wikiArticlesTable.id, existing.id));
        else await tx.insert(wikiArticlesTable).values({ wikiKey: "wiki", ...values });
        if (existing) articleByFile.set(article.file_id, { ...existing, ...values });
      }
    }
    for (const article of managedArticles) if (article.driveFileId && !seenFileIds.has(article.driveFileId)) {
      await tx.delete(wikiArticlesTable).where(eq(wikiArticlesTable.id, article.id));
    }
    for (const category of managedCategories) {
      if (category.driveFolderId && !seenFolderIds.has(category.driveFolderId)) {
        await tx.delete(wikiArticlesTable).where(and(eq(wikiArticlesTable.categoryId, category.id), eq(wikiArticlesTable.driveSyncManaged, true)));
        const remaining = await tx.select({ id: wikiArticlesTable.id }).from(wikiArticlesTable).where(eq(wikiArticlesTable.categoryId, category.id)).limit(1);
        if (!remaining[0] && category.driveSyncCreated) await tx.delete(wikiCategoriesTable).where(eq(wikiCategoriesTable.id, category.id));
        else await tx.update(wikiCategoriesTable).set({ driveSyncManaged: false, driveFolderId: null }).where(eq(wikiCategoriesTable.id, category.id));
      }
    }
  });
}

export async function runWikiDriveSync(full = false) {
  if (syncRunning && await durableLeaseIsValid()) throw new Error("Wiki Drive sync is already running");
  const runId = randomUUID();
  if (!await acquireLease(runId)) throw new Error("Wiki Drive sync is already running");
  syncRunning = true;
  let leaseLost = false;
  const leaseHeartbeat = setInterval(() => {
    void renewLease(runId).then((renewed) => {
      if (!renewed) leaseLost = true;
    }).catch((error) => {
      leaseLost = true;
      logger.warn({ error }, "Failed to renew Wiki Drive sync lease");
    });
  }, 5 * 60 * 1000);
  leaseHeartbeat.unref();
  const ensureLease = () => {
    if (leaseLost) throw new Error("Wiki Drive sync lease was lost");
  };
  let directory: string | null = null;
  try {
    const rootId = await setting(WIKI_DRIVE_SOURCE_SETTING);
    if (!rootId) throw new Error("Configure a Wiki source folder first");
    await setSetting(LAST_STARTED, new Date().toISOString());
    directory = await mkdtemp(resolve(tmpdir(), "wiki-drive-manifest-"));
    const oldCategories = await db.select().from(wikiCategoriesTable).where(and(eq(wikiCategoriesTable.wikiKey, "wiki"), eq(wikiCategoriesTable.driveSyncManaged, true)));
    const oldArticles = await db.select().from(wikiArticlesTable).where(and(eq(wikiArticlesTable.wikiKey, "wiki"), eq(wikiArticlesTable.driveSyncManaged, true)));
    const prior: Record<string, Record<string, unknown>> = {};
    for (const category of oldCategories) prior[category.name] = {};
    for (const article of oldArticles) {
      const category = oldCategories.find((c) => c.id === article.categoryId);
      if (category && article.driveFileId) prior[category.name][article.title] = { file_id: article.driveFileId, modified_time: article.driveModifiedAt?.toISOString(), drive_link: article.driveSourceUrl ?? "", content: article.content, extracted_at: article.updatedAt.toISOString() };
    }
    const categories = await listChildren(rootId, DRIVE_FOLDER);
    ensureLease();
    const categoryNames = new Set<string>();
    for (const folder of categories) {
      if (categoryNames.has(folder.name)) throw new Error(`Duplicate immediate Drive folder name: "${folder.name}"`);
      categoryNames.add(folder.name);
    }
    const manifest = { categories: [] as Array<{ id: string; name: string; files: Array<{ id: string; name: string; modified_time: string; drive_link: string; local_path?: string }> }> };
    for (const folder of categories) {
      ensureLease();
      const files = await listChildren(folder.id, PDF);
      const fileNames = new Set<string>();
      for (const file of files) {
        if (fileNames.has(file.name)) throw new Error(`Duplicate PDF name in Drive folder "${folder.name}": "${file.name}"`);
        fileNames.add(file.name);
      }
      const priorHeading = prior[folder.name] ?? {};
      const mapped: Array<{ id: string; name: string; modified_time: string; drive_link: string; local_path?: string }> = [];
      for (const file of files) {
        ensureLease();
        if (file.size && Number(file.size) > MAX_PDF_BYTES) throw new Error(`PDF "${file.name}" exceeds ${MAX_PDF_BYTES} byte limit`);
        const p = priorHeading[file.name] as { file_id?: string; modified_time?: string } | undefined;
        const changed = full || !p || p.file_id !== file.id || p.modified_time !== file.modifiedTime;
        mapped.push({ id: file.id, name: file.name, modified_time: file.modifiedTime, drive_link: file.webViewLink ?? "", ...(changed ? { local_path: await downloadPdf(file.id, directory) } : {}) });
      }
      manifest.categories.push({ id: folder.id, name: folder.name, files: mapped });
    }
    ensureLease();
    const result = await invokeEngine(manifest, prior, full);
    ensureLease();
    if (result.stats.failed > 0) {
      const errors = (result.stats.errors ?? []).slice(0, 5).join("; ");
      throw new Error(`Drive PDF extraction failed for ${result.stats.failed} file(s)${errors ? `: ${errors}` : ""}`);
    }
    await applyResult(runId, result.data, manifest);
    await setSetting(LAST_SUCCESS, new Date().toISOString());
    await setSetting(LAST_SUMMARY, JSON.stringify(result.stats));
    await setSetting(LAST_ERROR, "");
    return result.stats;
  } catch (error) {
    await setSetting(LAST_ERROR, error instanceof Error ? error.message : "Sync failed");
    throw error;
  } finally {
    if (directory) {
      try { await rm(directory, { recursive: true, force: true }); } catch (error) {
        logger.warn({ error }, "Failed to remove Wiki Drive sync temporary directory");
      }
    }
    try { await releaseLease(runId); } catch (error) {
      logger.warn({ error }, "Failed to release Wiki Drive sync lease");
    }
    clearInterval(leaseHeartbeat);
    syncRunning = false;
  }
}

export async function getWikiDriveSyncStatus() {
  const [sourceFolderId, lastSuccessAt, lastSummary, lastError, lastStartedAt] = await Promise.all([setting(WIKI_DRIVE_SOURCE_SETTING), setting(LAST_SUCCESS), setting(LAST_SUMMARY), setting(LAST_ERROR), setting(LAST_STARTED)]);
  const state = (syncRunning || await durableLeaseIsValid()) ? "running" : lastError ? "error" : lastSuccessAt ? "success" : "idle";
  return {
    sourceFolderId,
    sourceFolderLink: sourceFolderId ? `https://drive.google.com/drive/folders/${encodeURIComponent(sourceFolderId)}` : null,
    connectionConfigured: true,
    status: {
      state,
      lastSyncedAt: lastSuccessAt,
      lastAttemptedAt: lastStartedAt,
      lastError: lastError || null,
      summary: lastSummary ? JSON.parse(lastSummary) : null,
    },
  };
}

export async function browseWikiDriveFolders(parentId?: string) {
  const folders = await listChildren(parentId ?? "root", DRIVE_FOLDER);
  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    webViewLink: folder.webViewLink ?? `https://drive.google.com/drive/folders/${encodeURIComponent(folder.id)}`,
  }));
}

export function startWikiDriveScheduler() {
  const runIfDue = async () => {
    try {
      const configuredHour = Number(process.env.WIKI_DRIVE_SYNC_HOUR_UTC ?? "6");
      const hour = Number.isInteger(configuredHour) && configuredHour >= 0 && configuredHour <= 23
        ? configuredHour
        : 6;
      if (new Date().getUTCHours() < hour || syncRunning) return;
      if (!await setting(WIKI_DRIVE_SOURCE_SETTING)) return;
      const last = await setting(LAST_SUCCESS);
      const utcDate = (value: Date) => value.toISOString().slice(0, 10);
      if (last && utcDate(new Date(last)) === utcDate(new Date())) return;
      await runWikiDriveSync();
    } catch (error) {
      logger.error({ error }, "Scheduled Wiki Drive sync failed");
    }
  };
  void runIfDue();
  const timer = setInterval(() => void runIfDue(), 60 * 60 * 1000);
  timer.unref();
}