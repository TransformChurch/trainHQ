import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, assignmentsTable, modulesTable, quizResultsTable, watchHistoryTable, queueTable, videosTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, getDbUser } from "../middlewares/requireAuth";

const router = Router();

// GET /dashboard/summary
router.get("/summary", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const dbUser = await getDbUser(auth!.userId!);
    if (!dbUser) {
      res.json({
        assignedModules: [],
        totalModulesAvailable: 0,
        totalModulesCompleted: 0,
        totalVideosWatched: 0,
        queueCount: 0,
        recentActivity: [],
      });
      return;
    }

    // Assigned modules
    const assignmentRows = await db
      .select({ a: assignmentsTable, module: modulesTable })
      .from(assignmentsTable)
      .innerJoin(modulesTable, eq(assignmentsTable.moduleId, modulesTable.id))
      .where(eq(assignmentsTable.userId, dbUser.id));

    const quizResults = await db
      .select()
      .from(quizResultsTable)
      .where(eq(quizResultsTable.userId, dbUser.id));
    const quizMap = new Map(quizResults.map(qr => [qr.moduleId, qr]));

    const assignedModules = assignmentRows.map(row => ({
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
    }));

    // Stats
    const allModules = await db.select().from(modulesTable);
    const completedModuleIds = new Set(quizResults.filter(qr => qr.passed).map(qr => qr.moduleId));
    const watchHistory = await db
      .select({ wh: watchHistoryTable, video: videosTable })
      .from(watchHistoryTable)
      .innerJoin(videosTable, eq(watchHistoryTable.videoId, videosTable.id))
      .where(eq(watchHistoryTable.userId, dbUser.id))
      .orderBy(desc(watchHistoryTable.lastWatchedAt))
      .limit(10);

    const queueItems = await db
      .select()
      .from(queueTable)
      .where(eq(queueTable.userId, dbUser.id));

    const totalVideosWatched = await db
      .select()
      .from(watchHistoryTable)
      .where(and(eq(watchHistoryTable.userId, dbUser.id), eq(watchHistoryTable.completed, true)));

    res.json({
      assignedModules,
      totalModulesAvailable: allModules.length,
      totalModulesCompleted: completedModuleIds.size,
      totalVideosWatched: totalVideosWatched.length,
      queueCount: queueItems.length,
      recentActivity: watchHistory.map(row => ({
        id: row.wh.id,
        userId: row.wh.userId,
        videoId: row.wh.videoId,
        video: { ...row.video, createdAt: row.video.createdAt.toISOString() },
        progressPercent: row.wh.progressPercent,
        completed: row.wh.completed,
        lastWatchedAt: row.wh.lastWatchedAt.toISOString(),
      })),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
