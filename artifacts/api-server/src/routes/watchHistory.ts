import { Router } from "express";
import { getAuth } from "../middlewares/auth";
import { db, watchHistoryTable, videosTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, getDbUser } from "../middlewares/requireAuth";
import { UpsertWatchProgressBody } from "@workspace/api-zod";
import { checkGrowthTrackProgression } from "../lib/growthTrackProgression";

const router = Router();

function formatWatchHistoryEntry(wh: typeof watchHistoryTable.$inferSelect, video?: typeof videosTable.$inferSelect | null) {
  return {
    id: wh.id,
    userId: wh.userId,
    videoId: wh.videoId,
    video: video ? { ...video, createdAt: video.createdAt.toISOString() } : null,
    progressPercent: wh.progressPercent,
    completed: wh.completed,
    needsReview: wh.needsReview,
    lastWatchedAt: wh.lastWatchedAt.toISOString(),
  };
}

// GET /watch-history
router.get("/", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const dbUser = await getDbUser(auth!.userId!);
    if (!dbUser) {
      res.json([]);
      return;
    }
    const history = await db
      .select({ wh: watchHistoryTable, video: videosTable })
      .from(watchHistoryTable)
      .innerJoin(videosTable, eq(watchHistoryTable.videoId, videosTable.id))
      .where(eq(watchHistoryTable.userId, dbUser.id))
      .orderBy(desc(watchHistoryTable.lastWatchedAt));

    res.json(history.map(row => formatWatchHistoryEntry(row.wh, row.video)));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /watch-history/:videoId — update progress; completing clears needsReview
router.put("/:videoId", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const videoId = parseInt(req.params.videoId as string);
    const parsed = UpsertWatchProgressBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const dbUser = await getDbUser(auth!.userId!);
    if (!dbUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { progressPercent, completed } = parsed.data;
    const isCompleted = completed ?? (progressPercent >= 90);

    const existing = await db
      .select()
      .from(watchHistoryTable)
      .where(and(eq(watchHistoryTable.userId, dbUser.id), eq(watchHistoryTable.videoId, videoId)))
      .limit(1);

    // When a video is (re-)completed, clear the needsReview flag so the quiz can unlock again
    const clearNeedsReview = isCompleted;

    let wh;
    if (existing[0]) {
      const updated = await db
        .update(watchHistoryTable)
        .set({
          progressPercent,
          completed: isCompleted,
          lastWatchedAt: new Date(),
          ...(clearNeedsReview ? { needsReview: false } : {}),
        })
        .where(and(eq(watchHistoryTable.userId, dbUser.id), eq(watchHistoryTable.videoId, videoId)))
        .returning();
      wh = updated[0];
    } else {
      const inserted = await db
        .insert(watchHistoryTable)
        .values({ userId: dbUser.id, videoId, progressPercent, completed: isCompleted, needsReview: false })
        .returning();
      wh = inserted[0];
    }

    const videos = await db.select().from(videosTable).where(eq(videosTable.id, videoId)).limit(1);

    // Trigger growth track auto-progression when a video completes and may unlock the module
    if (isCompleted && videos[0]) {
      void checkGrowthTrackProgression(dbUser.id, videos[0].moduleId);
    }

    res.json(formatWatchHistoryEntry(wh, videos[0] ?? null));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
