import { Router } from "express";
import { getAuth } from "../middlewares/auth";
import { db, usersTable, assignmentsTable, modulesTable, quizResultsTable, groupMembersTable, watchHistoryTable, videosTable, settingsTable, contentAuditLogTable } from "@workspace/db";
import { eq, and, inArray, desc, isNull } from "drizzle-orm";
import { requireAdmin, requireManagerOrAdmin, getDbUser } from "../middlewares/requireAuth";
import { UpdateUserRoleBody } from "@workspace/api-zod";
import adminDocumentsRouter from "./adminDocuments";
import contentGrantsRouter from "./contentGrants";
import { syncPlanningCenterModuleAssignment } from "../lib/planningCenter";
import adminFacilitiesRouter from "./adminFacilities";
import adminWikiRouter, { createAdminWikiRouter } from "./adminWiki";
import adminTracksRouter from "./adminTracks";
import adminPlanningCenterRouter from "./adminPlanningCenter";
import adminWikiDriveSyncRouter from "./adminWikiDriveSync";
import { adminToolAccessRouter } from "./toolAccess";
import { resolveFromHeader } from "../lib/email";

const router = Router();

// ── GET /api/admin/me ─────────────────────────────────────────────────────────
// Returns the current authenticated manager/admin's profile and role.
router.get("/me", requireManagerOrAdmin, (req, res) => {
  const u = res.locals.dbUser;
  res.json({ id: u.id, externalUserId: u.externalUserId, role: u.role, firstName: u.firstName, lastName: u.lastName });
});

async function sendAssignmentEmail(
  toEmail: string,
  toName: string,
  moduleName: string,
  dueDate: string | null,
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    const from = resolveFromHeader();
    if (!from) {
      console.error("Skipping assignment email: EMAIL_FROM is not a valid sender address");
      return;
    }
    const dueLine = dueDate
      ? `<p><strong>Due:</strong> ${new Date(dueDate).toLocaleDateString()}</p>`
      : "";
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: toEmail,
        subject: `New Training Module Assigned: ${moduleName}`,
        html: `
          <h2>You've been assigned a new training module</h2>
          <p>Hi ${toName},</p>
          <p>A new training module has been assigned to you:</p>
          <p><strong>${moduleName}</strong></p>
          ${dueLine}
          <p>Log in to your Transform Church training portal to get started.</p>
        `,
      }),
    });
  } catch (err) {
    console.error("Failed to send assignment email:", err);
  }
}

// GET /admin/users — managers and admins can view
router.get("/users", requireManagerOrAdmin, async (req, res) => {
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.lastName);
    const allResults = await db.select().from(quizResultsTable);
    const allAssignments = await db.select().from(assignmentsTable);

    const resultMap = new Map<string, typeof allResults>();
    for (const r of allResults) {
      if (!resultMap.has(r.userId)) resultMap.set(r.userId, []);
      resultMap.get(r.userId)!.push(r);
    }
    const assignCountMap = new Map<string, number>();
    for (const a of allAssignments) {
      assignCountMap.set(a.userId, (assignCountMap.get(a.userId) ?? 0) + 1);
    }

    res.json(users.map(u => ({
      id: u.id,
      externalUserId: u.externalUserId,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phone: u.phone,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      quizResults: (resultMap.get(u.id) ?? []).map(qr => ({
        ...qr,
        takenAt: qr.takenAt.toISOString(),
      })),
      assignmentCount: assignCountMap.get(u.id) ?? 0,
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /admin/users/:userId/role — admin only (managers cannot promote/demote)
router.patch("/users/:userId/role", requireAdmin, async (req, res) => {
  try {
    const userId = req.params.userId as string;
    const parsed = UpdateUserRoleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const updated = await db.update(usersTable).set({ role: parsed.data.role }).where(eq(usersTable.id, userId)).returning();
    if (!updated[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const u = updated[0];
    res.json({ id: u.id, externalUserId: u.externalUserId, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, role: u.role, createdAt: u.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/assignments — managers and admins can assign
router.post("/assignments", requireManagerOrAdmin, async (req, res) => {
  try {
    const actor = res.locals.dbUser;
    const body = req.body as { userIds?: string[]; groupId?: number; moduleId?: number; dueDate?: string | null; notifyEmail?: boolean; resetProgress?: boolean };
    if (!body.moduleId || typeof body.moduleId !== "number") {
      res.status(400).json({ error: "moduleId is required" });
      return;
    }

    const moduleId = body.moduleId;
    const dueDate = body.dueDate ?? null;
    const notifyEmail = body.notifyEmail ?? false;
    const resetProgress = body.resetProgress ?? false;
    let userIds: string[] = Array.isArray(body.userIds) ? body.userIds : [];

    // If groupId provided, expand to group members
    if (body.groupId) {
      const members = await db
        .select({ userId: groupMembersTable.userId })
        .from(groupMembersTable)
        .where(eq(groupMembersTable.groupId, body.groupId));
      userIds = [...new Set([...userIds, ...members.map(m => m.userId)])];
    }

    if (userIds.length === 0) {
      res.status(400).json({ error: "No users to assign" });
      return;
    }

    const mod = await db.select().from(modulesTable).where(eq(modulesTable.id, moduleId)).limit(1);
    const moduleData = mod[0];

    // Audit findings 1.9/2.5: this loop used to run 3 separate per-user
    // reads that don't actually depend on which user is being processed
    // except by membership in a fixed set -- a usersTable select (used
    // twice: once for the PCO sync, then re-fetched again for the email
    // notification), an assignmentsTable select, and a moduleVideos select
    // that only depends on the single fixed `moduleId` for this whole
    // request. Batched/hoisted so each runs once total instead of once (or
    // twice) per user.
    const targetUserRows = await db.select().from(usersTable).where(inArray(usersTable.id, userIds));
    const targetUserById = new Map(targetUserRows.map((user) => [user.id, user]));

    const existingAssignmentRows = await db.select().from(assignmentsTable)
      .where(and(inArray(assignmentsTable.userId, userIds), eq(assignmentsTable.moduleId, moduleId)))
      .orderBy(assignmentsTable.id);
    // No unique constraint on (userId, moduleId) at the DB level; keep the
    // lowest-id row per user to match the original per-user `.limit(1)`
    // query's likely behavior on an un-ordered scan.
    const existingAssignmentByUserId = new Map<string, typeof existingAssignmentRows[number]>();
    for (const row of existingAssignmentRows) {
      if (!existingAssignmentByUserId.has(row.userId)) existingAssignmentByUserId.set(row.userId, row);
    }

    let moduleVideoIds: number[] = [];
    if (resetProgress) {
      const moduleVideos = await db.select({ id: videosTable.id }).from(videosTable)
        .where(eq(videosTable.moduleId, moduleId));
      moduleVideoIds = moduleVideos.map((v) => v.id);
    }

    // Audit finding 1.9 (High): one unpaced PCO call per user in this loop
    // -- for a module assigned to N users, N sequential requests with no
    // delay between them. See the identical fix (and fuller explanation)
    // in adminTracks.ts's /:trackId/assign handler.
    const PCO_SYNC_DELAY_MS = 200;
    let pcoCallCount = 0;
    async function pacedPcoSync<T>(run: () => Promise<T>): Promise<T> {
      if (pcoCallCount > 0) await new Promise((resolve) => setTimeout(resolve, PCO_SYNC_DELAY_MS));
      pcoCallCount += 1;
      return run();
    }

    const inserted = [];
    for (const userId of userIds) {
      // Reset quiz results + watch history if requested
      if (resetProgress) {
        await db.delete(quizResultsTable)
          .where(and(eq(quizResultsTable.userId, userId), eq(quizResultsTable.moduleId, moduleId)));

        if (moduleVideoIds.length > 0) {
          await db.delete(watchHistoryTable)
            .where(and(
              eq(watchHistoryTable.userId, userId),
              inArray(watchHistoryTable.videoId, moduleVideoIds),
            ));
        }
      }

      const existing = existingAssignmentByUserId.get(userId);

      let a;
      if (existing) {
        const updateValues: Partial<typeof assignmentsTable.$inferInsert & { seenAt: Date | null; assignedAt: Date }> = {
          assignedBy: actor.id,
          assignedAt: new Date(),
          dueDate: dueDate ? new Date(dueDate) : null,
        };
        if (resetProgress) updateValues.seenAt = null;
        const updated = await db
          .update(assignmentsTable)
          .set(updateValues)
          .where(eq(assignmentsTable.id, existing.id))
          .returning();
        a = updated[0];
      } else {
        const rows = await db.insert(assignmentsTable).values({
          userId,
          moduleId,
          assignedBy: actor.id,
          dueDate: dueDate ? new Date(dueDate) : null,
        }).returning();
        a = rows[0];
      }

      const targetUser = targetUserById.get(userId);
      const planningCenterSync = targetUser
        ? await pacedPcoSync(() => syncPlanningCenterModuleAssignment(targetUser, moduleId, a.assignedAt))
        : {
            status: "failed" as const,
            code: "assignment_user_missing",
            message: "The assigned member could not be found.",
          };
      if (planningCenterSync.status === "failed") {
        req.log.warn({ userId, moduleId, code: planningCenterSync.code }, "Planning Center assignment sync failed");
      }
      inserted.push({
        id: a.id,
        userId: a.userId,
        moduleId: a.moduleId,
        module: moduleData ? { ...moduleData, createdAt: moduleData.createdAt.toISOString() } : null,
        assignedBy: a.assignedBy,
        assignedAt: a.assignedAt.toISOString(),
        dueDate: a.dueDate ? a.dueDate.toISOString() : null,
        seenAt: a.seenAt ? a.seenAt.toISOString() : null,
        quizResult: null,
        planningCenterSync,
      });

      // Send email notification for new assignments
      if (notifyEmail && moduleData && targetUser) {
        sendAssignmentEmail(
          targetUser.email,
          `${targetUser.firstName} ${targetUser.lastName}`,
          moduleData.title,
          dueDate ?? null,
        ).catch(() => {});
      }
    }

    res.status(201).json(inserted);
  } catch (err) {
    req.log.error({ err }, "Admin module assignment failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /admin/assignments/:assignmentId — managers and admins
router.delete("/assignments/:assignmentId", requireManagerOrAdmin, async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.assignmentId as string);
    await db.delete(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/progress-matrix — managers and admins
router.get("/progress-matrix", requireManagerOrAdmin, async (req, res) => {
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.lastName);
    const modules = await db.select().from(modulesTable).orderBy(modulesTable.order);
    const allResults = await db.select().from(quizResultsTable);

    const resultMap = new Map<string, Map<number, typeof allResults[0]>>();
    for (const r of allResults) {
      if (!resultMap.has(r.userId)) resultMap.set(r.userId, new Map());
      resultMap.get(r.userId)!.set(r.moduleId, r);
    }

    const rows = users.map(user => ({
      user: {
        id: user.id,
        externalUserId: user.externalUserId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
      results: modules.map(mod => {
        const result = resultMap.get(user.id)?.get(mod.id);
        return {
          moduleId: mod.id,
          passed: result?.passed ?? null,
          score: result?.score ?? null,
          totalQuestions: result?.totalQuestions ?? null,
          attempts: result?.attempts ?? null,
        };
      }),
    }));

    res.json({
      modules: modules.map(m => ({ ...m, createdAt: m.createdAt.toISOString() })),
      rows,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /admin/modules/:moduleId/visibility — managers and admins
router.patch("/modules/:moduleId/visibility", requireManagerOrAdmin, async (req, res) => {
  try {
    const moduleId = parseInt(req.params.moduleId as string);
    const { isPublic } = req.body;
    if (typeof isPublic !== "boolean") {
      res.status(400).json({ error: "isPublic must be a boolean" });
      return;
    }
    const updated = await db.update(modulesTable).set({ isPublic }).where(eq(modulesTable.id, moduleId)).returning();
    if (!updated[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ...updated[0], createdAt: updated[0].createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/settings — admin only
router.get("/settings", requireAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(settingsTable);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /admin/settings — admin only
router.patch("/settings", requireAdmin, async (req, res) => {
  try {
    const { key, value } = req.body as { key?: string; value?: string };
    if (!key || typeof key !== "string" || typeof value !== "string") {
      res.status(400).json({ error: "key and value are required" });
      return;
    }
    const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
    let row;
    if (existing[0]) {
      const updated = await db.update(settingsTable).set({ value }).where(eq(settingsTable.key, key)).returning();
      row = updated[0];
    } else {
      const inserted = await db.insert(settingsTable).values({ key, value }).returning();
      row = inserted[0];
    }
    res.json(row);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/audit-log — admin only, optional ?trackId filter
router.get("/audit-log", requireAdmin, async (req, res) => {
  try {
    const trackId = req.query.trackId ? parseInt(req.query.trackId as string) : undefined;

    let rows;
    if (trackId) {
      rows = await db
        .select()
        .from(contentAuditLogTable)
        .where(eq(contentAuditLogTable.trackId, trackId))
        .orderBy(desc(contentAuditLogTable.createdAt))
        .limit(200);
    } else {
      rows = await db
        .select()
        .from(contentAuditLogTable)
        .orderBy(desc(contentAuditLogTable.createdAt))
        .limit(200);
    }

    res.json(rows.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.use("/documents", adminDocumentsRouter);
router.use("/content-grants", contentGrantsRouter);
router.use("/facilities", adminFacilitiesRouter);
router.use("/wiki", adminWikiRouter);
router.use("/tc-wiki", createAdminWikiRouter("tc-wiki"));
router.use("/tracks", adminTracksRouter);
router.use("/planning-center", adminPlanningCenterRouter);
router.use("/wiki-drive-sync", adminWikiDriveSyncRouter);
router.use("/tool-access", adminToolAccessRouter);

export default router;
