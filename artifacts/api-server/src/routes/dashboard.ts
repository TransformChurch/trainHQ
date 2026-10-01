import { Router } from "express";
import { getAuth } from "../middlewares/auth";
import { db, assignmentsTable, modulesTable, quizResultsTable, watchHistoryTable, queueTable, videosTable, moduleCompletionsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, getDbUser } from "../middlewares/requireAuth";

const router = Router();

// totalModulesAvailable is the same number for every user on every request --
// it isn't scoped to the requesting user at all -- so fetching every
// module's full row from the DB just to read `.length` on every single
// dashboard load is wasted work that gets worse as the modules table grows.
// This API runs as a single container instance (wrangler.toml:
// max_instances = 1), so a plain in-memory cache is safe here -- there's no
// second instance it could go stale relative to -- and a short TTL means an
// admin adding/removing a module still shows up within a minute.
const MODULE_COUNT_CACHE_TTL_MS = 60_000;
let moduleCountCache: { count: number; expiresAt: number } | null = null;

async function getTotalModulesAvailable(): Promise<number> {
  if (moduleCountCache && moduleCountCache.expiresAt > Date.now()) {
    return moduleCountCache.count;
  }
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(modulesTable);
  const count = row?.count ?? 0;
  moduleCountCache = { count, expiresAt: Date.now() + MODULE_COUNT_CACHE_TTL_MS };
  return count;
}

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

    // These lookups are all independent of one another -- none depends on
    // another's result -- so run them concurrently instead of one round trip
    // at a time. With Supabase sitting over the network from this
    // container, that's the difference between roughly one round trip's
    // worth of latency per dashboard load and several stacked end to end.
    // The two row counts below (totalModulesAvailable, completed videos)
    // also no longer pull full rows just to measure `.length` -- Postgres
    // counts them instead of shipping every row back for Node to count.
    const [
      assignmentRows,
      quizResults,
      completionRows,
      totalModulesAvailable,
      watchHistory,
      queueItems,
      completedVideosRow,
    ] = await Promise.all([
      db
        .select({ a: assignmentsTable, module: modulesTable })
        .from(assignmentsTable)
        .innerJoin(modulesTable, eq(assignmentsTable.moduleId, modulesTable.id))
        .where(eq(assignmentsTable.userId, dbUser.id)),
      db.select().from(quizResultsTable).where(eq(quizResultsTable.userId, dbUser.id)),
      db.select().from(moduleCompletionsTable).where(eq(moduleCompletionsTable.userId, dbUser.id)),
      getTotalModulesAvailable(),
      db
        .select({ wh: watchHistoryTable, video: videosTable })
        .from(watchHistoryTable)
        .innerJoin(videosTable, eq(watchHistoryTable.videoId, videosTable.id))
        .where(eq(watchHistoryTable.userId, dbUser.id))
        .orderBy(desc(watchHistoryTable.lastWatchedAt))
        .limit(10),
      db.select().from(queueTable).where(eq(queueTable.userId, dbUser.id)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(watchHistoryTable)
        .where(and(eq(watchHistoryTable.userId, dbUser.id), eq(watchHistoryTable.completed, true))),
    ]);

    const quizMap = new Map(quizResults.map(qr => [qr.moduleId, qr]));
    const completionMap = new Map(completionRows.map(row => [row.moduleId, row]));

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
      moduleCompletedAt: completionMap.get(row.a.moduleId)?.completedAt.toISOString() ?? null,
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

    const completedModuleIds = new Set(quizResults.filter(qr => qr.passed).map(qr => qr.moduleId));
    for (const completion of completionRows) completedModuleIds.add(completion.moduleId);

    res.json({
      assignedModules,
      totalModulesAvailable,
      totalModulesCompleted: completedModuleIds.size,
      totalVideosWatched: completedVideosRow[0]?.count ?? 0,
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
  } catch (error) {
    req.log.error({ err: error }, "Failed to build dashboard summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
