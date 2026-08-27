import { Router } from "express";
import { getAuth } from "../middlewares/auth";
import { db, documentsTable, documentAccessTable, groupMembersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, getDbUser } from "../middlewares/requireAuth";

const router = Router();

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

    const memberships = await db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.userId, dbUser.id));
    const groupIds = memberships.map(m => String(m.groupId));

    const directGrants = await db
      .select({ documentId: documentAccessTable.documentId })
      .from(documentAccessTable)
      .where(and(
        eq(documentAccessTable.principalType, "user"),
        eq(documentAccessTable.principalId, dbUser.id),
      ));

    const groupGrants = groupIds.length > 0
      ? await db
          .select({ documentId: documentAccessTable.documentId })
          .from(documentAccessTable)
          .where(and(
            eq(documentAccessTable.principalType, "group"),
            inArray(documentAccessTable.principalId, groupIds),
          ))
      : [];

    const grantedIds = [...new Set([
      ...directGrants.map(g => g.documentId),
      ...groupGrants.map(g => g.documentId),
    ])];

    if (grantedIds.length === 0) { res.json([]); return; }

    // Fetch the granted documents/folders themselves
    const grantedDocs = await db
      .select()
      .from(documentsTable)
      .where(inArray(documentsTable.id, grantedIds))
      .orderBy(documentsTable.sortOrder, documentsTable.createdAt);

    // Folder-access inheritance: if a folder was granted, include its child files
    const grantedFolderIds = grantedDocs
      .filter(d => d.resourceType === "folder")
      .map(d => d.id);

    const childrenOfGrantedFolders = grantedFolderIds.length > 0
      ? await db
          .select()
          .from(documentsTable)
          .where(and(
            inArray(documentsTable.parentId as any, grantedFolderIds),
            eq(documentsTable.resourceType, "file"),
          ))
          .orderBy(documentsTable.sortOrder, documentsTable.createdAt)
      : [];

    // Merge: granted items + inherited children (de-duplicate)
    const allKnown = new Map<number, typeof documentsTable.$inferSelect>();
    for (const d of [...grantedDocs, ...childrenOfGrantedFolders]) {
      if (!allKnown.has(d.id)) allKnown.set(d.id, d);
    }

    // Also include parent folder records for grouping (for file grants whose folder isn't otherwise included)
    const parentIds = [...new Set(
      [...allKnown.values()]
        .map(d => d.parentId)
        .filter(Boolean) as number[]
    )];
    const parentFolders = parentIds.length > 0
      ? await db.select().from(documentsTable).where(inArray(documentsTable.id, parentIds))
      : [];
    for (const f of parentFolders) {
      if (!allKnown.has(f.id)) allKnown.set(f.id, f);
    }

    const serialize = (d: typeof documentsTable.$inferSelect) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    });

    res.json([...allKnown.values()].map(serialize));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
