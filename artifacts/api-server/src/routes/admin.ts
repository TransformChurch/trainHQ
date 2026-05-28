import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, assignmentsTable, modulesTable, quizResultsTable, groupMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAdmin, getDbUser } from "../middlewares/requireAuth";
import { UpdateUserRoleBody } from "@workspace/api-zod";

const router = Router();

async function sendAssignmentEmail(
  toEmail: string,
  toName: string,
  moduleName: string,
  dueDate: string | null,
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    const fromAddr = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
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
        from: `Transform Church <${fromAddr}>`,
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

// GET /admin/users
router.get("/users", requireAdmin, async (req, res) => {
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
      clerkId: u.clerkId,
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

// PATCH /admin/users/:userId/role
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
    res.json({ id: u.id, clerkId: u.clerkId, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, role: u.role, createdAt: u.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/assignments
router.post("/assignments", requireAdmin, async (req, res) => {
  try {
    const auth = getAuth(req);
    const body = req.body as { userIds?: string[]; groupId?: number; moduleId?: number; dueDate?: string | null; notifyEmail?: boolean; resetProgress?: boolean };
    if (!body.moduleId || typeof body.moduleId !== "number") {
      res.status(400).json({ error: "moduleId is required" });
      return;
    }
    const adminUser = await getDbUser(auth!.userId!);
    if (!adminUser) {
      res.status(403).json({ error: "Forbidden" });
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

    const inserted = [];
    for (const userId of userIds) {
      // Reset quiz results if requested
      if (resetProgress) {
        await db.delete(quizResultsTable)
          .where(and(eq(quizResultsTable.userId, userId), eq(quizResultsTable.moduleId, moduleId)));
      }

      const existing = await db
        .select()
        .from(assignmentsTable)
        .where(and(eq(assignmentsTable.userId, userId), eq(assignmentsTable.moduleId, moduleId)))
        .limit(1);

      if (existing[0]) {
        // Update existing assignment: refresh assignedBy/dueDate and optionally reset seenAt
        const updateValues: Partial<typeof assignmentsTable.$inferInsert & { seenAt: Date | null; assignedAt: Date }> = {
          assignedBy: adminUser.id,
          assignedAt: new Date(),
          dueDate: dueDate ? new Date(dueDate) : null,
        };
        if (resetProgress) updateValues.seenAt = null;
        const updated = await db
          .update(assignmentsTable)
          .set(updateValues)
          .where(eq(assignmentsTable.id, existing[0].id))
          .returning();
        const a = updated[0];
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
        });
        continue;
      }

      const rows = await db.insert(assignmentsTable).values({
        userId,
        moduleId,
        assignedBy: adminUser.id,
        dueDate: dueDate ? new Date(dueDate) : null,
      }).returning();
      const a = rows[0];
      inserted.push({
        id: a.id,
        userId: a.userId,
        moduleId: a.moduleId,
        module: moduleData ? { ...moduleData, createdAt: moduleData.createdAt.toISOString() } : null,
        assignedBy: a.assignedBy,
        assignedAt: a.assignedAt.toISOString(),
        dueDate: a.dueDate ? a.dueDate.toISOString() : null,
        seenAt: null,
        quizResult: null,
      });

      // Send email notification for new assignments
      if (notifyEmail && moduleData) {
        const userRows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        const user = userRows[0];
        if (user) {
          sendAssignmentEmail(
            user.email,
            `${user.firstName} ${user.lastName}`,
            moduleData.title,
            dueDate ?? null,
          ).catch(() => {});
        }
      }
    }

    res.status(201).json(inserted);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /admin/assignments/:assignmentId
router.delete("/assignments/:assignmentId", requireAdmin, async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.assignmentId as string);
    await db.delete(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/progress-matrix
router.get("/progress-matrix", requireAdmin, async (req, res) => {
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
        clerkId: user.clerkId,
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

// PATCH /admin/modules/:moduleId/visibility
router.patch("/modules/:moduleId/visibility", requireAdmin, async (req, res) => {
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

export default router;
