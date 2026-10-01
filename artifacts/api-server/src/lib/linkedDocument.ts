import { db, documentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Shared by modules.ts (a document-type module's own content) and videos.ts
// (an optional file attached alongside a video) -- both just need "does this
// documentId point at a real, viewable file, and if so what's its public
// summary". Returns null for a missing document, a folder, or a file with no
// driveUrl (nothing to link to).
export async function resolveLinkedDocument(documentId: number | null | undefined) {
  if (!documentId) return null;
  const documents = await db
    .select({
      id: documentsTable.id,
      title: documentsTable.title,
      description: documentsTable.description,
      driveUrl: documentsTable.driveUrl,
      mimeType: documentsTable.mimeType,
      resourceType: documentsTable.resourceType,
    })
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId))
    .limit(1);
  const document = documents[0];
  if (!document || document.resourceType !== "file" || !document.driveUrl) return null;
  return {
    id: document.id,
    title: document.title,
    description: document.description,
    driveUrl: document.driveUrl,
    mimeType: document.mimeType,
  };
}
