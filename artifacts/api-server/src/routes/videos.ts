import { Router } from "express";
import { db, videosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { CreateVideoBody, UpdateVideoBody } from "@workspace/api-zod";

const router = Router();

// GET /videos
router.get("/", requireAuth, async (req, res) => {
  try {
    const moduleId = req.query.moduleId ? parseInt(req.query.moduleId as string) : undefined;
    const videos = moduleId
      ? await db.select().from(videosTable).where(eq(videosTable.moduleId, moduleId)).orderBy(videosTable.order)
      : await db.select().from(videosTable).orderBy(videosTable.order);
    res.json(videos.map(v => ({ ...v, createdAt: v.createdAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /videos
router.post("/", requireAdmin, async (req, res) => {
  try {
    const parsed = CreateVideoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const inserted = await db.insert(videosTable).values(parsed.data).returning();
    const v = inserted[0];
    res.status(201).json({ ...v, createdAt: v.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /videos/:videoId
router.get("/:videoId", requireAuth, async (req, res) => {
  try {
    const videoId = parseInt(req.params.videoId as string);
    const videos = await db.select().from(videosTable).where(eq(videosTable.id, videoId)).limit(1);
    if (!videos[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const v = videos[0];
    res.json({ ...v, createdAt: v.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /videos/:videoId
router.patch("/:videoId", requireAdmin, async (req, res) => {
  try {
    const videoId = parseInt(req.params.videoId as string);
    const parsed = UpdateVideoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const updated = await db.update(videosTable).set(parsed.data).where(eq(videosTable.id, videoId)).returning();
    if (!updated[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const v = updated[0];
    res.json({ ...v, createdAt: v.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /videos/:videoId
router.delete("/:videoId", requireAdmin, async (req, res) => {
  try {
    const videoId = parseInt(req.params.videoId as string);
    await db.delete(videosTable).where(eq(videosTable.id, videoId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
