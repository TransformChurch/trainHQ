import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, assignmentsTable, modulesTable, quizResultsTable, watchHistoryTable, queueTable, videosTable } from "@workspace/db";
import { eq, and, desc, isNull } from "drizzle-orm";
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
      seenAt: row.a.seenAt ? row.a.seenAt.toISOString() : null,
      isNew: row.a.seenAt === null,
      quizResult: quizMap.get(row.a.moduleId)
        ? { ...quizMap.get(row.a.moduleId)!, takenAt: quizMap.get(row.a.moduleId)!.takenAt.toISOString() }
        : null,
    }));

    // Mark all unseen assignments as seen (fire and forget)
    const unseenIds = assignmentRows
      .filter(row => row.a.seenAt === null)
      .map(row => row.a.id);
    if (unseenIds.length > 0) {
      const now = new Date();
      Promise.all(
        unseenIds.map(id =>
          db.update(assignmentsTable).set({ seenAt: now }).where(eq(assignmentsTable.id, id))
        )
      ).catch(() => {});
    }

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

    const completedVideos = await db
      .select()
      .from(watchHistoryTable)
      .where(and(eq(watchHistoryTable.userId, dbUser.id), eq(watchHistoryTable.completed, true)));

    res.json({
      assignedModules,
      totalModulesAvailable: allModules.length,
      totalModulesCompleted: completedModuleIds.size,
      totalVideosWatched: completedVideos.length,
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
