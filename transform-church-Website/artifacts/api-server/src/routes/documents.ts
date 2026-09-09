import { Router } from "express";
import { getAuth } from "../middlewares/auth";
import { db, documentsTable, documentAccessTable, groupMembersTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth, getDbUser } from "../middlewares/requireAuth";

const router = Router();

const visibleDocumentColumns = {
  id: documentsTable.id,
  title: documentsTable.title,
  description: documentsTable.description,
  driveUrl: documentsTable.driveUrl,
  mimeType: documentsTable.mimeType,
  resourceType: documentsTable.resourceType,
  parentId: documentsTable.parentId,
  sortOrder: documentsTable.sortOrder,
  createdByExternalUserId: documentsTable.createdByExternalUserId,
  createdAt: documentsTable.createdAt,
};

async function visibleDocumentsForUser(userId: string) {
  const memberships = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(eq(groupMembersTable.userId, userId));
  const groupIds = memberships.map((membership) => String(membership.groupId));
  const directGrants = await db
    .select({ documentId: documentAccessTable.documentId })
    .from(documentAccessTable)
    .where(and(
      eq(documentAccessTable.principalType, "user"),
      eq(documentAccessTable.principalId, userId),
    ));
  const groupGrants = groupIds.length
    ? await db
        .select({ documentId: documentAccessTable.documentId })
        .from(documentAccessTable)
        .where(and(
          eq(documentAccessTable.principalType, "group"),
          inArray(documentAccessTable.principalId, groupIds),
        ))
    : [];
  const grantedIds = [...new Set([
    ...directGrants.map((grant) => grant.documentId),
    ...groupGrants.map((grant) => grant.documentId),
  ])];
  if (!grantedIds.length) return [];

  const grantedDocs = await db.select(visibleDocumentColumns).from(documentsTable)
    .where(inArray(documentsTable.id, grantedIds))
    .orderBy(documentsTable.sortOrder, documentsTable.createdAt);
  const grantedFolderIds = grantedDocs
    .filter((document) => document.resourceType === "folder")
    .map((document) => document.id);
  const inherited = grantedFolderIds.length
    ? await db.select(visibleDocumentColumns).from(documentsTable).where(and(
        inArray(documentsTable.parentId as any, grantedFolderIds),
        eq(documentsTable.resourceType, "file"),
      ))
    : [];
  const allKnown = new Map([...grantedDocs, ...inherited].map((document) => [document.id, document]));
  const parentIds = [...new Set(
    [...allKnown.values()].map((document) => document.parentId).filter(Boolean) as number[],
  )];
  if (parentIds.length) {
    const parents = await db.select(visibleDocumentColumns).from(documentsTable)
      .where(inArray(documentsTable.id, parentIds));
    const grantedIdSet = new Set(grantedIds);
    for (const parent of parents) {
      if (!allKnown.has(parent.id)) {
        allKnown.set(parent.id, grantedIdSet.has(parent.id) ? parent : { ...parent, driveUrl: null });
      }
    }
  }
  return [...allKnown.values()];
}

function oneSentence(value: unknown): string {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!normalized) return "";
  const sentence = normalized.match(/^.{1,280}?[.!?](?:\s|$)/)?.[0]?.trim();
  if (sentence) return sentence;
  return normalized.length <= 280 ? normalized : `${normalized.slice(0, 277).trimEnd()}…`;
}

router.get("/search", requireAuth, async (req, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 200) : "";
    if (query.length < 2) {
      res.json([]);
      return;
    }
    const auth = getAuth(req);
    const dbUser = await getDbUser(auth!.userId!);
    if (!dbUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const visibleDocuments = await visibleDocumentsForUser(dbUser.id);
    const ids = visibleDocuments.filter((document) =>
      document.resourceType === "file" && document.mimeType === "application/pdf",
    ).map((document) => document.id);
    if (!ids.length) {
      res.json([]);
      return;
    }
    const idParams = sql.join(ids.map((id) => sql`${id}`), sql`, `);
    const result = await db.execute(sql`
      SELECT
        id,
        title,
        description,
        drive_url AS "driveUrl",
        mime_type AS "mimeType",
        resource_type AS "resourceType",
        parent_id AS "parentId",
        created_at AS "createdAt",
        ts_headline(
          'english',
          pdf_text,
          plainto_tsquery('english', ${query}),
          'StartSel=, StopSel=, MaxFragments=1, MaxWords=36, MinWords=10, FragmentDelimiter= '
        ) AS context
      FROM documents
      WHERE id IN (${idParams})
        AND pdf_text_status = 'ready'
        AND to_tsvector('english', coalesce(pdf_text, '')) @@ plainto_tsquery('english', ${query})
      ORDER BY
        ts_rank_cd(
          to_tsvector('english', coalesce(pdf_text, '')),
          plainto_tsquery('english', ${query})
        ) DESC,
        title ASC
      LIMIT 10
    `);
    const rows = result.rows as Array<{
      id: number;
      title: string;
      description: string | null;
      driveUrl: string | null;
      mimeType: string | null;
      resourceType: "file";
      parentId: number | null;
      createdAt: Date | string;
      context: string;
    }>;
    res.json(rows.map((row) => ({
      ...row,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      context: oneSentence(row.context),
    })));
  } catch (error) {
    req.log.error({ err: error }, "Document PDF search failed");
    res.status(500).json({ error: "Document search failed" });
  }
});

// ── Student-facing: GET /api/documents ───────────────────────────────────────
// Returns all documents accessible to the signed-in user:
//   - directly granted file/folder
//   - files inside a granted folder (folder-level inheritance, one level deep)
//   - group grants resolve the same way
// Also includes parent folder records so the frontend can reconstruct groupings.

router.get("/", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const dbUser = await getDbUser(auth!.userId!);
    if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }

    const allKnown = await visibleDocumentsForUser(dbUser.id);

    const serialize = (d: (typeof allKnown)[number]) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    });

    res.json(allKnown.map(serialize));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
