import { Router } from "express";
import {
  db,
  groupsTable,
  groupMembersTable,
  groupManagersTable,
  groupJoinRequestsTable,
  usersTable,
  assignmentsTable,
  modulesTable,
  quizQuestionsTable,
  quizResultsTable,
  watchHistoryTable,
  videosTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireManagerOrAdmin, requireAdmin, requireAuth } from "../middlewares/requireAuth";
import { getAuth } from "@clerk/express";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function isGroupManager(groupId: number, userId: string): Promise<boolean> {
  const row = await db
    .select()
    .from(groupManagersTable)
    .where(and(eq(groupManagersTable.groupId, groupId), eq(groupManagersTable.userId, userId)))
    .limit(1);
  return !!row[0];
}

async function requireGroupAccess(
  groupId: number,
  dbUser: { id: string; role: string },
  res: any
): Promise<boolean> {
  if (dbUser.role === "admin") return true;
  const ok = await isGroupManager(groupId, dbUser.id);
  if (!ok) {
    res.status(403).json({ error: "Forbidden: you do not manage this group" });
    return false;
  }
  return true;
}

async function buildGroupList(groupIds?: number[]) {
  const groups = groupIds
    ? await db.select().from(groupsTable).where(inArray(groupsTable.id, groupIds)).orderBy(groupsTable.name)
    : await db.select().from(groupsTable).orderBy(groupsTable.name);

  const members = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable);

  const pendingRequests = await db
    .select({ groupId: groupJoinRequestsTable.groupId })
    .from(groupJoinRequestsTable)
    .where(eq(groupJoinRequestsTable.status, "pending"));

  const memberCountMap = new Map<number, number>();
  for (const m of members) {
    memberCountMap.set(m.groupId, (memberCountMap.get(m.groupId) ?? 0) + 1);
  }

  const pendingCountMap = new Map<number, number>();
  for (const r of pendingRequests) {
    pendingCountMap.set(r.groupId, (pendingCountMap.get(r.groupId) ?? 0) + 1);
  }

  return groups.map(g => ({
    ...g,
    createdAt: g.createdAt.toISOString(),
    memberCount: memberCountMap.get(g.id) ?? 0,
    pendingRequests: pendingCountMap.get(g.id) ?? 0,
  }));
}

// ─── GET /groups — manager-scoped or all (admin) ─────────────────────────────

router.get("/", requireManagerOrAdmin, async (req, res) => {
  try {
    const dbUser = res.locals.dbUser;

    if (dbUser.role === "admin") {
      res.json(await buildGroupList());
      return;
    }

    // Manager: only groups they manage
    const managed = await db
      .select({ groupId: groupManagersTable.groupId })
      .from(groupManagersTable)
      .where(eq(groupManagersTable.userId, dbUser.id));

    const groupIds = managed.map(r => r.groupId);
    if (groupIds.length === 0) {
      res.json([]);
      return;
    }

    res.json(await buildGroupList(groupIds));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /groups/mine — shortcut: groups the current user manages ─────────────

router.get("/mine", requireManagerOrAdmin, async (req, res) => {
  try {
    const dbUser = res.locals.dbUser;
    if (dbUser.role === "admin") {
      res.json(await buildGroupList());
      return;
    }
    const managed = await db
      .select({ groupId: groupManagersTable.groupId })
      .from(groupManagersTable)
      .where(eq(groupManagersTable.userId, dbUser.id));
    const groupIds = managed.map(r => r.groupId);
    res.json(groupIds.length > 0 ? await buildGroupList(groupIds) : []);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /groups/available — student-facing: all groups with membership status ─

router.get("/available", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const dbUser = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, auth.userId))
      .limit(1);
    if (!dbUser[0]) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userId = dbUser[0].id;
    const groups = await db.select().from(groupsTable).orderBy(groupsTable.name);

    const memberships = await db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.userId, userId));
    const memberGroupIds = new Set(memberships.map(m => m.groupId));

    const myRequests = await db
      .select({ groupId: groupJoinRequestsTable.groupId, status: groupJoinRequestsTable.status })
      .from(groupJoinRequestsTable)
      .where(eq(groupJoinRequestsTable.userId, userId));
    const requestMap = new Map(myRequests.map(r => [r.groupId, r.status]));

    const memberCountMap = new Map<number, number>();
    const allMembers = await db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable);
    for (const m of allMembers) {
      memberCountMap.set(m.groupId, (memberCountMap.get(m.groupId) ?? 0) + 1);
    }

    res.json(groups.map(g => ({
      id: g.id,
      name: g.name,
      description: g.description,
      createdAt: g.createdAt.toISOString(),
      memberCount: memberCountMap.get(g.id) ?? 0,
      isMember: memberGroupIds.has(g.id),
      requestStatus: requestMap.get(g.id) ?? null,
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /groups ─────────────────────────────────────────────────────────────

router.post("/", requireManagerOrAdmin, async (req, res) => {
  try {
    const dbUser = res.locals.dbUser;
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

    // Auto-assign manager as group manager when they create a group
    if (dbUser.role === "manager") {
      await db.insert(groupManagersTable).values({ groupId: g.id, userId: dbUser.id });
    }

    res.status(201).json({ ...g, createdAt: g.createdAt.toISOString(), memberCount: 0, pendingRequests: 0 });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /groups/:groupId ───────────────────────────────────────────────────

router.patch("/:groupId", requireManagerOrAdmin, async (req, res) => {
  try {
    const dbUser = res.locals.dbUser;
    const groupId = parseInt(req.params.groupId as string);
    if (!(await requireGroupAccess(groupId, dbUser, res))) return;

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

// ─── DELETE /groups/:groupId ──────────────────────────────────────────────────

router.delete("/:groupId", requireAdmin, async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId as string);
    await db.delete(groupsTable).where(eq(groupsTable.id, groupId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /groups/:groupId/members ─────────────────────────────────────────────

router.get("/:groupId/members", requireManagerOrAdmin, async (req, res) => {
  try {
    const dbUser = res.locals.dbUser;
    const groupId = parseInt(req.params.groupId as string);
    if (!(await requireGroupAccess(groupId, dbUser, res))) return;

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

// ─── POST /groups/:groupId/members ────────────────────────────────────────────

router.post("/:groupId/members", requireManagerOrAdmin, async (req, res) => {
  try {
    const dbUser = res.locals.dbUser;
    const groupId = parseInt(req.params.groupId as string);
    if (!(await requireGroupAccess(groupId, dbUser, res))) return;

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

// ─── DELETE /groups/:groupId/members/:userId ──────────────────────────────────

router.delete("/:groupId/members/:userId", requireManagerOrAdmin, async (req, res) => {
  try {
    const dbUser = res.locals.dbUser;
    const groupId = parseInt(req.params.groupId as string);
    if (!(await requireGroupAccess(groupId, dbUser, res))) return;

    const userId = req.params.userId as string;
    await db
      .delete(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /groups/:groupId/managers ────────────────────────────────────────────

router.get("/:groupId/managers", requireAdmin, async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId as string);
    const rows = await db
      .select({ gm: groupManagersTable, user: usersTable })
      .from(groupManagersTable)
      .innerJoin(usersTable, eq(groupManagersTable.userId, usersTable.id))
      .where(eq(groupManagersTable.groupId, groupId));

    res.json(rows.map(r => ({
      id: r.gm.id,
      groupId: r.gm.groupId,
      addedAt: r.gm.addedAt.toISOString(),
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

// ─── POST /groups/:groupId/managers ──────────────────────────────────────────

router.post("/:groupId/managers", requireAdmin, async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId as string);
    const { userId } = req.body;
    if (!userId || typeof userId !== "string") {
      res.status(400).json({ error: "userId required" });
      return;
    }
    const existing = await db
      .select()
      .from(groupManagersTable)
      .where(and(eq(groupManagersTable.groupId, groupId), eq(groupManagersTable.userId, userId)))
      .limit(1);
    if (existing[0]) {
      res.status(409).json({ error: "User is already a manager of this group" });
      return;
    }
    await db.insert(groupManagersTable).values({ groupId, userId });
    res.status(201).json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /groups/:groupId/managers/:userId ─────────────────────────────────

router.delete("/:groupId/managers/:userId", requireAdmin, async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId as string);
    const userId = req.params.userId as string;
    await db
      .delete(groupManagersTable)
      .where(and(eq(groupManagersTable.groupId, groupId), eq(groupManagersTable.userId, userId)));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /groups/:groupId/emails ──────────────────────────────────────────────

router.get("/:groupId/emails", requireManagerOrAdmin, async (req, res) => {
  try {
    const dbUser = res.locals.dbUser;
    const groupId = parseInt(req.params.groupId as string);
    if (!(await requireGroupAccess(groupId, dbUser, res))) return;

    const rows = await db
      .select({ email: usersTable.email })
      .from(groupMembersTable)
      .innerJoin(usersTable, eq(groupMembersTable.userId, usersTable.id))
      .where(eq(groupMembersTable.groupId, groupId));

    res.json({ emails: rows.map(r => r.email) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /groups/:groupId/export.csv ─────────────────────────────────────────

router.get("/:groupId/export.csv", requireManagerOrAdmin, async (req, res) => {
  try {
    const dbUser = res.locals.dbUser;
    const groupId = parseInt(req.params.groupId as string);
    if (!(await requireGroupAccess(groupId, dbUser, res))) return;

    const group = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId)).limit(1);
    if (!group[0]) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    // Get all members with user info
    const memberRows = await db
      .select({ member: groupMembersTable, user: usersTable })
      .from(groupMembersTable)
      .innerJoin(usersTable, eq(groupMembersTable.userId, usersTable.id))
      .where(eq(groupMembersTable.groupId, groupId));

    if (memberRows.length === 0) {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="group-${groupId}-export.csv"`);
      res.send("Name,Email,Phone,Assigned Modules,Completed Modules,Completion %\n");
      return;
    }

    const userIds = memberRows.map(r => r.user.id);

    // Assignments for group members
    const assignments = await db
      .select({ userId: assignmentsTable.userId, moduleId: assignmentsTable.moduleId })
      .from(assignmentsTable)
      .where(inArray(assignmentsTable.userId, userIds));

    // Get all unique module ids assigned
    const allModuleIds = [...new Set(assignments.map(a => a.moduleId))];

    // Quiz results
    const quizResults = allModuleIds.length > 0
      ? await db
          .select({ userId: quizResultsTable.userId, moduleId: quizResultsTable.moduleId, passed: quizResultsTable.passed })
          .from(quizResultsTable)
          .where(and(
            inArray(quizResultsTable.userId, userIds),
            inArray(quizResultsTable.moduleId, allModuleIds),
            eq(quizResultsTable.passed, true),
          ))
      : [];

    // Modules with quiz info (determined by presence of quiz questions)
    const quizQuestionRows = allModuleIds.length > 0
      ? await db
          .select({ moduleId: quizQuestionsTable.moduleId })
          .from(quizQuestionsTable)
          .where(inArray(quizQuestionsTable.moduleId, allModuleIds))
      : [];
    const modulesWithQuiz = new Set(quizQuestionRows.map(q => q.moduleId));

    // Videos per module
    const videoRows = allModuleIds.length > 0
      ? await db
          .select({ id: videosTable.id, moduleId: videosTable.moduleId })
          .from(videosTable)
          .where(inArray(videosTable.moduleId, allModuleIds))
      : [];

    // Watch history for members
    const videoIds = videoRows.map(v => v.id);
    const watchHistory = videoIds.length > 0
      ? await db
          .select({ userId: watchHistoryTable.userId, videoId: watchHistoryTable.videoId })
          .from(watchHistoryTable)
          .where(and(
            inArray(watchHistoryTable.userId, userIds),
            inArray(watchHistoryTable.videoId, videoIds),
          ))
      : [];

    // Build lookup maps
    const videosPerModule = new Map<number, number[]>();
    for (const v of videoRows) {
      const arr = videosPerModule.get(v.moduleId) ?? [];
      arr.push(v.id);
      videosPerModule.set(v.moduleId, arr);
    }

    // passedQuizMap: userId -> Set<moduleId>
    const passedQuizMap = new Map<string, Set<number>>();
    for (const qr of quizResults) {
      const s = passedQuizMap.get(qr.userId) ?? new Set();
      s.add(qr.moduleId);
      passedQuizMap.set(qr.userId, s);
    }

    // watchedMap: userId -> Set<videoId>
    const watchedMap = new Map<string, Set<number>>();
    for (const wh of watchHistory) {
      const s = watchedMap.get(wh.userId) ?? new Set();
      s.add(wh.videoId);
      watchedMap.set(wh.userId, s);
    }

    // assignmentsPerUser: userId -> moduleId[]
    const assignmentsPerUser = new Map<string, number[]>();
    for (const a of assignments) {
      const arr = assignmentsPerUser.get(a.userId) ?? [];
      arr.push(a.moduleId);
      assignmentsPerUser.set(a.userId, arr);
    }

    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;

    const rows: string[] = ["Name,Email,Phone,Assigned Modules,Completed Modules,Completion %"];

    for (const { user } of memberRows) {
      const userModules = assignmentsPerUser.get(user.id) ?? [];
      const assignedCount = userModules.length;

      let completedCount = 0;
      for (const moduleId of userModules) {
        const vids = videosPerModule.get(moduleId) ?? [];
        const watched = watchedMap.get(user.id) ?? new Set();
        const allVideosWatched = vids.length > 0 && vids.every(vid => watched.has(vid));

        if (modulesWithQuiz.has(moduleId)) {
          // Module complete = all videos watched AND quiz passed
          const quizPassed = passedQuizMap.get(user.id)?.has(moduleId) ?? false;
          if (allVideosWatched && quizPassed) completedCount++;
        } else {
          // Module complete = all videos watched
          if (allVideosWatched) completedCount++;
        }
      }

      const pct = assignedCount > 0 ? Math.round((completedCount / assignedCount) * 100) : 0;
      rows.push([
        escapeCsv(`${user.firstName} ${user.lastName}`),
        escapeCsv(user.email),
        escapeCsv(user.phone ?? ""),
        String(assignedCount),
        String(completedCount),
        `${pct}%`,
      ].join(","));
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="group-${group[0].name.replace(/[^a-z0-9]/gi, "_")}-export.csv"`);
    res.send(rows.join("\n"));
  } catch (err) {
    console.error("CSV export error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /groups/:groupId/join-requests ───────────────────────────────────────

router.get("/:groupId/join-requests", requireManagerOrAdmin, async (req, res) => {
  try {
    const dbUser = res.locals.dbUser;
    const groupId = parseInt(req.params.groupId as string);
    if (!(await requireGroupAccess(groupId, dbUser, res))) return;

    const rows = await db
      .select({ jr: groupJoinRequestsTable, user: usersTable })
      .from(groupJoinRequestsTable)
      .innerJoin(usersTable, eq(groupJoinRequestsTable.userId, usersTable.id))
      .where(and(
        eq(groupJoinRequestsTable.groupId, groupId),
        eq(groupJoinRequestsTable.status, "pending"),
      ));

    res.json(rows.map(r => ({
      id: r.jr.id,
      groupId: r.jr.groupId,
      status: r.jr.status,
      requestedAt: r.jr.requestedAt.toISOString(),
      user: {
        id: r.user.id,
        firstName: r.user.firstName,
        lastName: r.user.lastName,
        email: r.user.email,
      },
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /groups/:groupId/join-requests ──────────────────────────────────────

router.post("/:groupId/join-requests", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const dbUserRows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, auth.userId))
      .limit(1);
    if (!dbUserRows[0]) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const dbUser = dbUserRows[0];
    // Only students can request to join; managers/admins manage groups directly
    if (dbUser.role !== "student") {
      res.status(403).json({ error: "Only students can submit join requests" });
      return;
    }
    const userId = dbUser.id;
    const groupId = parseInt(req.params.groupId as string);

    // Already a member?
    const alreadyMember = await db
      .select()
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)))
      .limit(1);
    if (alreadyMember[0]) {
      res.status(409).json({ error: "Already a member" });
      return;
    }

    // Already has pending request?
    const existingRequest = await db
      .select()
      .from(groupJoinRequestsTable)
      .where(and(
        eq(groupJoinRequestsTable.groupId, groupId),
        eq(groupJoinRequestsTable.userId, userId),
        eq(groupJoinRequestsTable.status, "pending"),
      ))
      .limit(1);
    if (existingRequest[0]) {
      res.status(409).json({ error: "Request already pending" });
      return;
    }

    const inserted = await db
      .insert(groupJoinRequestsTable)
      .values({ groupId, userId, status: "pending" })
      .returning();

    res.status(201).json({ id: inserted[0].id, status: "pending" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /groups/:groupId/join-requests/:requestId ─────────────────────────

router.patch("/:groupId/join-requests/:requestId", requireManagerOrAdmin, async (req, res) => {
  try {
    const dbUser = res.locals.dbUser;
    const groupId = parseInt(req.params.groupId as string);
    if (!(await requireGroupAccess(groupId, dbUser, res))) return;

    const requestId = parseInt(req.params.requestId as string);
    const { action } = req.body as { action?: "approve" | "deny" };
    if (action !== "approve" && action !== "deny") {
      res.status(400).json({ error: "action must be 'approve' or 'deny'" });
      return;
    }

    const jrRows = await db
      .select()
      .from(groupJoinRequestsTable)
      .where(and(eq(groupJoinRequestsTable.id, requestId), eq(groupJoinRequestsTable.groupId, groupId)))
      .limit(1);
    if (!jrRows[0]) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    const jr = jrRows[0];

    const newStatus = action === "approve" ? "approved" : "denied";
    await db
      .update(groupJoinRequestsTable)
      .set({ status: newStatus, reviewedAt: new Date(), reviewedBy: dbUser.id })
      .where(eq(groupJoinRequestsTable.id, requestId));

    if (action === "approve") {
      // Add to group members (idempotent)
      const existing = await db
        .select()
        .from(groupMembersTable)
        .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, jr.userId)))
        .limit(1);
      if (!existing[0]) {
        await db.insert(groupMembersTable).values({ groupId, userId: jr.userId });
      }
    }

    res.json({ ok: true, status: newStatus });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
