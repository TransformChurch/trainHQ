import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, assignmentsTable, modulesTable, quizResultsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAdmin, getDbUser } from "../middlewares/requireAuth";
import { UpdateUserRoleBody, CreateAssignmentBody } from "@workspace/api-zod";

const router = Router();

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
    const parsed = CreateAssignmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const adminUser = await getDbUser(auth!.userId!);
    if (!adminUser) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { userIds, moduleId, dueDate } = parsed.data;

    const inserted = [];
    for (const userId of userIds) {
      const existing = await db
        .select()
        .from(assignmentsTable)
        .where(and(eq(assignmentsTable.userId, userId), eq(assignmentsTable.moduleId, moduleId)))
        .limit(1);
      if (existing[0]) {
        const mods = await db.select().from(modulesTable).where(eq(modulesTable.id, moduleId)).limit(1);
        inserted.push({
          ...existing[0],
          assignedAt: existing[0].assignedAt.toISOString(),
          dueDate: existing[0].dueDate ? existing[0].dueDate.toISOString() : null,
          module: mods[0] ? { ...mods[0], createdAt: mods[0].createdAt.toISOString() } : null,
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
      const mods = await db.select().from(modulesTable).where(eq(modulesTable.id, moduleId)).limit(1);
      inserted.push({
        id: a.id,
        userId: a.userId,
        moduleId: a.moduleId,
        module: mods[0] ? { ...mods[0], createdAt: mods[0].createdAt.toISOString() } : null,
        assignedBy: a.assignedBy,
        assignedAt: a.assignedAt.toISOString(),
        dueDate: a.dueDate ? a.dueDate.toISOString() : null,
        quizResult: null,
      });
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

export default router;
