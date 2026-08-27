import { Router } from "express";
import { getAuth } from "../middlewares/auth";
import { db, assignmentsTable, modulesTable, quizResultsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, getDbUser } from "../middlewares/requireAuth";

const router = Router();

// GET /assignments - current user's assignments
router.get("/", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const dbUser = await getDbUser(auth!.userId!);
    if (!dbUser) {
      res.json([]);
      return;
    }

    const assignments = await db
      .select({ a: assignmentsTable, module: modulesTable })
      .from(assignmentsTable)
      .innerJoin(modulesTable, eq(assignmentsTable.moduleId, modulesTable.id))
      .where(eq(assignmentsTable.userId, dbUser.id));

    const quizResults = await db
      .select()
      .from(quizResultsTable)
      .where(eq(quizResultsTable.userId, dbUser.id));
    const quizMap = new Map(quizResults.map(qr => [qr.moduleId, qr]));

    res.json(assignments.map(row => ({
      id: row.a.id,
      userId: row.a.userId,
      moduleId: row.a.moduleId,
      module: { ...row.module, createdAt: row.module.createdAt.toISOString() },
      assignedBy: row.a.assignedBy,
      assignedAt: row.a.assignedAt.toISOString(),
      dueDate: row.a.dueDate ? row.a.dueDate.toISOString() : null,
      quizResult: quizMap.get(row.a.moduleId)
        ? { ...quizMap.get(row.a.moduleId)!, takenAt: quizMap.get(row.a.moduleId)!.takenAt.toISOString() }
        : null,
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
