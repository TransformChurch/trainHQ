import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, modulesTable, videosTable, watchHistoryTable, quizResultsTable, queueTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin, getDbUser } from "../middlewares/requireAuth";
import { CreateModuleBody, UpdateModuleBody } from "@workspace/api-zod";

const router = Router();

// GET /modules
router.get("/", requireAuth, async (req, res) => {
  try {
    const trackId = req.query.trackId ? parseInt(req.query.trackId as string) : undefined;
    const query = trackId
      ? db.select().from(modulesTable).where(eq(modulesTable.trackId, trackId)).orderBy(modulesTable.order)
      : db.select().from(modulesTable).orderBy(modulesTable.order);
    const modules = await query;
    res.json(modules.map(m => ({ ...m, createdAt: m.createdAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /modules
router.post("/", requireAdmin, async (req, res) => {
  try {
    const parsed = CreateModuleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const inserted = await db.insert(modulesTable).values(parsed.data).returning();
    const m = inserted[0];
    res.status(201).json({ ...m, createdAt: m.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /modules/:moduleId
router.get("/:moduleId", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const moduleId = parseInt(req.params.moduleId);
    const modules = await db.select().from(modulesTable).where(eq(modulesTable.id, moduleId)).limit(1);
    if (!modules[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const mod = modules[0];

    // Get videos
    const videos = await db.select().from(videosTable).where(eq(videosTable.moduleId, moduleId)).orderBy(videosTable.order);

    // Get user
    const dbUser = await getDbUser(auth!.userId!);
    const userId = dbUser?.id ?? "";

    // Get watch history for this user
    const watchHistory = userId
      ? await db.select().from(watchHistoryTable).where(eq(watchHistoryTable.userId, userId))
      : [];

    // Get queue items for this user
    const queueItems = userId
      ? await db.select().from(queueTable).where(eq(queueTable.userId, userId))
      : [];

    // Get quiz result
    const quizResults = userId
      ? await db.select().from(quizResultsTable).where(and(eq(quizResultsTable.userId, userId), eq(quizResultsTable.moduleId, moduleId))).limit(1)
      : [];
    const quizResult = quizResults[0] ?? null;

    // Determine quiz unlock: all videos completed
    const watchMap = new Map(watchHistory.map(w => [w.videoId, w]));
    const queueMap = new Set(queueItems.map(q => q.videoId));
    const quizUnlocked = videos.length > 0 && videos.every(v => watchMap.get(v.id)?.completed);

    res.json({
      ...mod,
      createdAt: mod.createdAt.toISOString(),
      videos: videos.map(v => {
        const wh = watchMap.get(v.id);
        return {
          ...v,
          createdAt: v.createdAt.toISOString(),
          progressPercent: wh?.progressPercent ?? null,
          completed: wh?.completed ?? false,
          inQueue: queueMap.has(v.id),
        };
      }),
      quizResult: quizResult
        ? { ...quizResult, takenAt: quizResult.takenAt.toISOString() }
        : null,
      quizUnlocked,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /modules/:moduleId
router.patch("/:moduleId", requireAdmin, async (req, res) => {
  try {
    const moduleId = parseInt(req.params.moduleId);
    const parsed = UpdateModuleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const updated = await db.update(modulesTable).set(parsed.data).where(eq(modulesTable.id, moduleId)).returning();
    if (!updated[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const m = updated[0];
    res.json({ ...m, createdAt: m.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /modules/:moduleId
router.delete("/:moduleId", requireAdmin, async (req, res) => {
  try {
    const moduleId = parseInt(req.params.moduleId);
    await db.delete(modulesTable).where(eq(modulesTable.id, moduleId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
