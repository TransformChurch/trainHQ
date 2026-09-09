import { PDFParse } from "pdf-parse";
import { db, documentsTable, type Document } from "@workspace/db";
import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_LENGTH = 2_000_000;
const MAX_INDEX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000;

function driveFileId(url: string | null): string | null {
  if (!url) return null;
  return url.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1]
    ?? url.match(/[?&]id=([A-Za-z0-9_-]+)/)?.[1]
    ?? null;
}

export async function indexDocumentPdf(document: Document): Promise<void> {
  if (document.resourceType !== "file" || document.mimeType !== "application/pdf") return;
  const sourceMatches = document.driveUrl
    ? eq(documentsTable.driveUrl, document.driveUrl)
    : isNull(documentsTable.driveUrl);
  const claimed = await db.update(documentsTable)
    .set({
      pdfTextStatus: "indexing",
      pdfTextExtractedAt: new Date(),
      pdfTextAttempts: sql`${documentsTable.pdfTextAttempts} + 1`,
    })
    .where(and(
      eq(documentsTable.id, document.id),
      sourceMatches,
      ne(documentsTable.pdfTextStatus, "indexing"),
      lt(documentsTable.pdfTextAttempts, MAX_INDEX_ATTEMPTS),
    ))
    .returning({ id: documentsTable.id });
  if (!claimed[0]) return;

  const fileId = driveFileId(document.driveUrl);
  if (!fileId) {
    await db.update(documentsTable)
      .set({ pdfText: null, pdfTextStatus: "failed", pdfTextExtractedAt: new Date() })
      .where(and(eq(documentsTable.id, document.id), sourceMatches));
    return;
  }

  try {
    const response = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Drive returned ${response.status}`);
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_PDF_BYTES) throw new Error("PDF is too large to index");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_PDF_BYTES) throw new Error("PDF is too large to index");
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("Drive response is not a PDF");

    const parser = new PDFParse({ data: bytes });
    const parsed = await parser.getText();
    await parser.destroy();
    const normalized = parsed.text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
    if (!normalized) throw new Error("PDF contains no searchable text");

    await db.update(documentsTable)
      .set({ pdfText: normalized, pdfTextStatus: "ready", pdfTextExtractedAt: new Date() })
      .where(and(eq(documentsTable.id, document.id), sourceMatches));
  } catch (error) {
    await db.update(documentsTable)
      .set({ pdfText: null, pdfTextStatus: "failed", pdfTextExtractedAt: new Date() })
      .where(and(eq(documentsTable.id, document.id), sourceMatches));
    throw error;
  }
}

let indexerStarted = false;
let indexerRunning = false;

async function runDocumentPdfIndexer() {
  if (indexerRunning) return;
  indexerRunning = true;
  try {
    while (true) {
      const retryBefore = new Date(Date.now() - RETRY_DELAY_MS);
      const pending = await db.select().from(documentsTable).where(and(
        eq(documentsTable.resourceType, "file"),
        eq(documentsTable.mimeType, "application/pdf"),
        lt(documentsTable.pdfTextAttempts, MAX_INDEX_ATTEMPTS),
        or(
          eq(documentsTable.pdfTextStatus, "pending"),
          and(
            or(eq(documentsTable.pdfTextStatus, "failed"), eq(documentsTable.pdfTextStatus, "indexing")),
            lt(documentsTable.pdfTextExtractedAt, retryBefore),
          ),
        ),
      )).limit(3);
      if (!pending.length) break;
      await Promise.all(pending.map((document) => indexDocumentPdf(document).catch(() => undefined)));
    }
  } finally {
    indexerRunning = false;
  }
}

export function startDocumentPdfIndexer() {
  if (indexerStarted) return;
  indexerStarted = true;
  void runDocumentPdfIndexer();
  const timer = setInterval(() => void runDocumentPdfIndexer(), 60_000);
  timer.unref();
}

export function queueDocumentPdfIndexing() {
  void runDocumentPdfIndexer();
}