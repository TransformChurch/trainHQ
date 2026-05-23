import { Router } from "express";
import { db, tracksTable, modulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { CreateTrackBody, UpdateTrackBody } from "@workspace/api-zod";

const router = Router();

// GET /tracks
router.get("/", requireAuth, async (req, res) => {
  try {
    const tracks = await db.select().from(tracksTable).orderBy(tracksTable.name);
    res.json(tracks.map(t => ({ ...t, createdAt: t.createdAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /tracks
router.post("/", requireAdmin, async (req, res) => {
  try {
    const parsed = CreateTrackBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const inserted = await db.insert(tracksTable).values(parsed.data).returning();
    const t = inserted[0];
    res.status(201).json({ ...t, createdAt: t.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /tracks/:trackId
router.get("/:trackId", requireAuth, async (req, res) => {
  try {
    const trackId = parseInt(req.params.trackId as string);
    const tracks = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId)).limit(1);
    if (!tracks[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const modules = await db.select().from(modulesTable).where(eq(modulesTable.trackId, trackId)).orderBy(modulesTable.order);
    const t = tracks[0];
    res.json({
      ...t,
      createdAt: t.createdAt.toISOString(),
      modules: modules.map(m => ({ ...m, createdAt: m.createdAt.toISOString() })),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /tracks/:trackId
router.patch("/:trackId", requireAdmin, async (req, res) => {
  try {
    const trackId = parseInt(req.params.trackId as string);
    const parsed = UpdateTrackBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const updated = await db.update(tracksTable).set(parsed.data).where(eq(tracksTable.id, trackId)).returning();
    if (!updated[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const t = updated[0];
    res.json({ ...t, createdAt: t.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /tracks/:trackId
router.delete("/:trackId", requireAdmin, async (req, res) => {
  try {
    const trackId = parseInt(req.params.trackId as string);
    await db.delete(tracksTable).where(eq(tracksTable.id, trackId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
