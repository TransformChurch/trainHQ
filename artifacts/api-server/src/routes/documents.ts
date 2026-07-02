import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, documentsTable, documentAccessTable, groupMembersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, getDbUser } from "../middlewares/requireAuth";

const router = Router();

// ── Student-facing: GET /api/documents ───────────────────────────────────────
// Returns all documents the current user can see via direct grant or group membership.

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

    const accessibleIds = [...new Set([
      ...directGrants.map(g => g.documentId),
      ...groupGrants.map(g => g.documentId),
    ])];

    if (accessibleIds.length === 0) { res.json([]); return; }

    const docs = await db
      .select()
      .from(documentsTable)
      .where(inArray(documentsTable.id, accessibleIds))
      .orderBy(documentsTable.sortOrder, documentsTable.createdAt);

    // Include parent folders so the frontend can reconstruct groupings
    const parentIds = [...new Set(docs.map(d => d.parentId).filter(Boolean) as number[])];
    const folders = parentIds.length > 0
      ? await db.select().from(documentsTable).where(inArray(documentsTable.id, parentIds))
      : [];

    const knownIds = new Set(docs.map(d => d.id));
    const extraFolders = folders.filter(f => !knownIds.has(f.id));

    const serialize = (d: typeof documentsTable.$inferSelect) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    });

    res.json([...docs.map(serialize), ...extraFolders.map(serialize)]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
