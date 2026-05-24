import { Router } from "express";
import { db, groupsTable, groupMembersTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";

const router = Router();

// GET /groups
router.get("/", requireAdmin, async (req, res) => {
  try {
    const groups = await db.select().from(groupsTable).orderBy(groupsTable.name);
    const members = await db
      .select({ groupId: groupMembersTable.groupId, userId: groupMembersTable.userId })
      .from(groupMembersTable);

    const memberCountMap = new Map<number, number>();
    for (const m of members) {
      memberCountMap.set(m.groupId, (memberCountMap.get(m.groupId) ?? 0) + 1);
    }

    res.json(groups.map(g => ({
      ...g,
      createdAt: g.createdAt.toISOString(),
      memberCount: memberCountMap.get(g.id) ?? 0,
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /groups
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body as { name?: string; description?: string | null };
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const inserted = await db.insert(groupsTable).values({
      name: name.trim(),
      description: description ?? null,
    }).returning();
    const g = inserted[0];
    res.status(201).json({ ...g, createdAt: g.createdAt.toISOString(), memberCount: 0 });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /groups/:groupId
router.patch("/:groupId", requireAdmin, async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId as string);
    const { name, description } = req.body as { name?: string; description?: string | null };
    const updates: Partial<{ name: string; description: string | null }> = {};
    if (name && typeof name === "string" && name.trim()) updates.name = name.trim();
    if (description !== undefined) updates.description = description ?? null;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    const updated = await db.update(groupsTable).set(updates).where(eq(groupsTable.id, groupId)).returning();
    if (!updated[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ...updated[0], createdAt: updated[0].createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /groups/:groupId
router.delete("/:groupId", requireAdmin, async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId as string);
    await db.delete(groupsTable).where(eq(groupsTable.id, groupId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /groups/:groupId/members
router.get("/:groupId/members", requireAdmin, async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId as string);
    const rows = await db
      .select({ member: groupMembersTable, user: usersTable })
      .from(groupMembersTable)
      .innerJoin(usersTable, eq(groupMembersTable.userId, usersTable.id))
      .where(eq(groupMembersTable.groupId, groupId));

    res.json(rows.map(r => ({
      id: r.member.id,
      groupId: r.member.groupId,
      addedAt: r.member.addedAt.toISOString(),
      user: {
        id: r.user.id,
        firstName: r.user.firstName,
        lastName: r.user.lastName,
        email: r.user.email,
        role: r.user.role,
      },
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /groups/:groupId/members
router.post("/:groupId/members", requireAdmin, async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId as string);
    const { userId } = req.body;
    if (!userId || typeof userId !== "string") {
      res.status(400).json({ error: "userId required" });
      return;
    }
    const existing = await db
      .select()
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)))
      .limit(1);
    if (existing[0]) {
      res.status(409).json({ error: "User already in group" });
      return;
    }
    const inserted = await db.insert(groupMembersTable).values({ groupId, userId }).returning();
    res.status(201).json(inserted[0]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /groups/:groupId/members/:userId
router.delete("/:groupId/members/:userId", requireAdmin, async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId as string);
    const userId = req.params.userId as string;
    await db
      .delete(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
