import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  db,
  documentsTable,
  documentAccessTable,
  groupMembersTable,
  groupsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireManagerOrAdmin, requireAuth, getDbUser } from "../middlewares/requireAuth";

const router = Router();

// ── Student-facing: GET /documents ────────────────────────────────────────────
// Returns all documents the current user can see (direct grant or via group).

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

    // Include parent folders even if not directly accessible
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

// ── Admin: GET /documents/admin ───────────────────────────────────────────────

router.get("/admin", requireManagerOrAdmin, async (req, res) => {
  try {
    const docs = await db
      .select()
      .from(documentsTable)
      .orderBy(documentsTable.parentId, documentsTable.sortOrder, documentsTable.createdAt);

    const counts = await db
      .select({
        documentId: documentAccessTable.documentId,
        count: sql<number>`count(*)::int`,
      })
      .from(documentAccessTable)
      .groupBy(documentAccessTable.documentId);

    const countMap = new Map(counts.map(c => [c.documentId, c.count]));

    res.json(docs.map(d => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      accessCount: countMap.get(d.id) ?? 0,
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: POST /documents/admin ──────────────────────────────────────────────

router.post("/admin", requireManagerOrAdmin, async (req, res) => {
  try {
    const auth = getAuth(req);
    const { title, description, driveUrl, resourceType, parentId } = req.body as {
      title?: string;
      description?: string | null;
      driveUrl?: string | null;
      resourceType?: "file" | "folder";
      parentId?: number | null;
    };
    if (!title || !title.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const type = resourceType ?? (driveUrl?.includes("/file/d/") ? "file" : driveUrl ? "folder" : "folder");
    const inserted = await db.insert(documentsTable).values({
      title: title.trim(),
      description: description ?? null,
      driveUrl: driveUrl?.trim() || null,
      resourceType: type,
      parentId: parentId ?? null,
      createdByClerkId: auth!.userId!,
    }).returning();
    res.status(201).json({ ...inserted[0], createdAt: inserted[0].createdAt.toISOString(), accessCount: 0 });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: PATCH /documents/admin/:id ────────────────────────────────────────

router.patch("/admin/:id", requireManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const { title, description, driveUrl, parentId, sortOrder } = req.body as {
      title?: string;
      description?: string | null;
      driveUrl?: string | null;
      parentId?: number | null;
      sortOrder?: number;
    };
    const updates: Record<string, unknown> = {};
    if (title !== undefined && title.trim()) updates.title = title.trim();
    if (description !== undefined) updates.description = description ?? null;
    if (driveUrl !== undefined) updates.driveUrl = driveUrl?.trim() || null;
    if (parentId !== undefined) updates.parentId = parentId ?? null;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    const updated = await db.update(documentsTable).set(updates).where(eq(documentsTable.id, id)).returning();
    if (!updated[0]) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...updated[0], createdAt: updated[0].createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: DELETE /documents/admin/:id ───────────────────────────────────────

router.delete("/admin/:id", requireManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    // Unparent children before deleting the folder
    await db.update(documentsTable).set({ parentId: null }).where(eq(documentsTable.parentId, id));
    await db.delete(documentsTable).where(eq(documentsTable.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: GET /documents/admin/:id/access ───────────────────────────────────

router.get("/admin/:id/access", requireManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const grants = await db
      .select()
      .from(documentAccessTable)
      .where(eq(documentAccessTable.documentId, id))
      .orderBy(documentAccessTable.grantedAt);

    // Resolve display names
    const groupIds = grants.filter(g => g.principalType === "group").map(g => parseInt(g.principalId));
    const userIds = grants.filter(g => g.principalType === "user").map(g => g.principalId);

    const groups = groupIds.length > 0
      ? await db.select({ id: groupsTable.id, name: groupsTable.name }).from(groupsTable).where(inArray(groupsTable.id, groupIds))
      : [];
    const users = userIds.length > 0
      ? await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, userIds))
      : [];

    const groupNameMap = new Map(groups.map(g => [g.id, g.name]));
    const userNameMap = new Map(users.map(u => [u.id, { name: `${u.firstName} ${u.lastName}`.trim() || u.email, email: u.email }]));

    res.json(grants.map(g => ({
      ...g,
      grantedAt: g.grantedAt.toISOString(),
      displayName: g.principalType === "group"
        ? (groupNameMap.get(parseInt(g.principalId)) ?? `Group ${g.principalId}`)
        : (userNameMap.get(g.principalId)?.name ?? g.principalId),
      email: g.principalType === "user" ? (userNameMap.get(g.principalId)?.email ?? null) : null,
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: POST /documents/admin/:id/access ───────────────────────────────────

router.post("/admin/:id/access", requireManagerOrAdmin, async (req, res) => {
  try {
    const auth = getAuth(req);
    const id = parseInt(req.params.id as string);
    const { principalType, principalId } = req.body as { principalType?: string; principalId?: string };
    if (!principalType || !principalId) {
      res.status(400).json({ error: "principalType and principalId are required" });
      return;
    }
    if (principalType !== "group" && principalType !== "user") {
      res.status(400).json({ error: "principalType must be 'group' or 'user'" });
      return;
    }
    const existing = await db
      .select()
      .from(documentAccessTable)
      .where(and(
        eq(documentAccessTable.documentId, id),
        eq(documentAccessTable.principalType, principalType as "group" | "user"),
        eq(documentAccessTable.principalId, principalId),
      ))
      .limit(1);
    if (existing[0]) { res.status(409).json({ error: "Access already granted" }); return; }

    const inserted = await db.insert(documentAccessTable).values({
      documentId: id,
      principalType: principalType as "group" | "user",
      principalId,
      grantedByClerkId: auth!.userId!,
    }).returning();
    res.status(201).json({ ...inserted[0], grantedAt: inserted[0].grantedAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: DELETE /documents/admin/:id/access/:accessId ──────────────────────

router.delete("/admin/:id/access/:accessId", requireManagerOrAdmin, async (req, res) => {
  try {
    const accessId = parseInt(req.params.accessId as string);
    await db.delete(documentAccessTable).where(eq(documentAccessTable.id, accessId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
