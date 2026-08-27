import { Router } from "express";
import { getAuth } from "../middlewares/auth";
import { db, queueTable, videosTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, getDbUser } from "../middlewares/requireAuth";

const router = Router();

// GET /queue
router.get("/", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const dbUser = await getDbUser(auth!.userId!);
    if (!dbUser) {
      res.json([]);
      return;
    }
    const items = await db
      .select({ q: queueTable, video: videosTable })
      .from(queueTable)
      .innerJoin(videosTable, eq(queueTable.videoId, videosTable.id))
      .where(eq(queueTable.userId, dbUser.id))
      .orderBy(desc(queueTable.addedAt));

    res.json(items.map(row => ({
      id: row.q.id,
      userId: row.q.userId,
      videoId: row.q.videoId,
      video: { ...row.video, createdAt: row.video.createdAt.toISOString() },
      addedAt: row.q.addedAt.toISOString(),
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /queue/:videoId
router.post("/:videoId", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const videoId = parseInt(req.params.videoId as string);
    const dbUser = await getDbUser(auth!.userId!);
    if (!dbUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const existing = await db
      .select()
      .from(queueTable)
      .where(and(eq(queueTable.userId, dbUser.id), eq(queueTable.videoId, videoId)))
      .limit(1);
    if (existing[0]) {
      const video = await db.select().from(videosTable).where(eq(videosTable.id, videoId)).limit(1);
      res.status(201).json({
        id: existing[0].id, userId: existing[0].userId, videoId: existing[0].videoId,
        video: video[0] ? { ...video[0], createdAt: video[0].createdAt.toISOString() } : null,
        addedAt: existing[0].addedAt.toISOString(),
      });
      return;
    }

    const inserted = await db.insert(queueTable).values({ userId: dbUser.id, videoId }).returning();
    const q = inserted[0];
    const videos = await db.select().from(videosTable).where(eq(videosTable.id, videoId)).limit(1);
    const video = videos[0];

    res.status(201).json({
      id: q.id, userId: q.userId, videoId: q.videoId,
      video: video ? { ...video, createdAt: video.createdAt.toISOString() } : null,
      addedAt: q.addedAt.toISOString(),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /queue/:videoId
router.delete("/:videoId", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const videoId = parseInt(req.params.videoId as string);
    const dbUser = await getDbUser(auth!.userId!);
    if (!dbUser) {
      res.status(204).send();
      return;
    }
    await db.delete(queueTable).where(and(eq(queueTable.userId, dbUser.id), eq(queueTable.videoId, videoId)));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
