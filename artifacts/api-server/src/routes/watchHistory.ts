import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, watchHistoryTable, videosTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, getDbUser } from "../middlewares/requireAuth";
import { UpsertWatchProgressBody } from "@workspace/api-zod";

const router = Router();

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
      .select({
        wh: watchHistoryTable,
        video: videosTable,
      })
      .from(watchHistoryTable)
      .innerJoin(videosTable, eq(watchHistoryTable.videoId, videosTable.id))
      .where(eq(watchHistoryTable.userId, dbUser.id))
      .orderBy(desc(watchHistoryTable.lastWatchedAt));

    res.json(history.map(row => ({
      id: row.wh.id,
      userId: row.wh.userId,
      videoId: row.wh.videoId,
      video: { ...row.video, createdAt: row.video.createdAt.toISOString() },
      progressPercent: row.wh.progressPercent,
      completed: row.wh.completed,
      lastWatchedAt: row.wh.lastWatchedAt.toISOString(),
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /watch-history/:videoId
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

    let wh;
    if (existing[0]) {
      const updated = await db
        .update(watchHistoryTable)
        .set({ progressPercent, completed: isCompleted, lastWatchedAt: new Date() })
        .where(and(eq(watchHistoryTable.userId, dbUser.id), eq(watchHistoryTable.videoId, videoId)))
        .returning();
      wh = updated[0];
    } else {
      const inserted = await db
        .insert(watchHistoryTable)
        .values({ userId: dbUser.id, videoId, progressPercent, completed: isCompleted })
        .returning();
      wh = inserted[0];
    }

    const videos = await db.select().from(videosTable).where(eq(videosTable.id, videoId)).limit(1);
    const video = videos[0];

    res.json({
      id: wh.id,
      userId: wh.userId,
      videoId: wh.videoId,
      video: video ? { ...video, createdAt: video.createdAt.toISOString() } : null,
      progressPercent: wh.progressPercent,
      completed: wh.completed,
      lastWatchedAt: wh.lastWatchedAt.toISOString(),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
