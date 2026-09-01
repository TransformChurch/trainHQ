import { Router } from "express";
import { getAuth } from "../middlewares/auth";
import { db, videosTable, modulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireManagerOrAdmin } from "../middlewares/requireAuth";
import { CreateVideoBody, UpdateVideoBody } from "@workspace/api-zod";
import { logContentChange } from "../lib/auditLog";
import { canEditContent } from "../lib/canEditContent";

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
router.post("/", requireManagerOrAdmin, async (req, res) => {
  try {
    const auth = getAuth(req);
    const actor = res.locals.dbUser;
    const parsed = CreateVideoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const moduleRows = await db
      .select({ id: modulesTable.id, contentType: modulesTable.contentType })
      .from(modulesTable)
      .where(eq(modulesTable.id, parsed.data.moduleId))
      .limit(1);
    if (!moduleRows[0]) {
      res.status(404).json({ error: "Module not found" });
      return;
    }
    if (moduleRows[0].contentType !== "video") {
      res.status(409).json({ error: "Videos can only be added to video modules" });
      return;
    }
    const inserted = await db.insert(videosTable).values({
      ...parsed.data,
      createdByExternalUserId: auth!.userId!,
    }).returning();
    const v = inserted[0];
    const mod = await db.select({ trackId: modulesTable.trackId }).from(modulesTable).where(eq(modulesTable.id, v.moduleId)).limit(1);
    logContentChange({
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      action: "create",
      entityType: "video",
      entityId: v.id,
      entityName: v.title,
      trackId: mod[0]?.trackId ?? null,
    }).catch(() => {});
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
router.patch("/:videoId", requireManagerOrAdmin, async (req, res) => {
  try {
    const actor = res.locals.dbUser;
    const videoId = parseInt(req.params.videoId as string);

    const existing = await db.select().from(videosTable).where(eq(videosTable.id, videoId)).limit(1);
    if (!existing[0]) { res.status(404).json({ error: "Not found" }); return; }
    if (!(await canEditContent(actor, "video", videoId, existing[0].createdByExternalUserId))) {
      res.status(403).json({ error: "You don't have permission to edit this video." });
      return;
    }

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
    const mod = await db.select({ trackId: modulesTable.trackId }).from(modulesTable).where(eq(modulesTable.id, v.moduleId)).limit(1);
    logContentChange({
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      action: "update",
      entityType: "video",
      entityId: v.id,
      entityName: v.title,
      trackId: mod[0]?.trackId ?? null,
    }).catch(() => {});
    res.json({ ...v, createdAt: v.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /videos/:videoId
router.delete("/:videoId", requireManagerOrAdmin, async (req, res) => {
  try {
    const actor = res.locals.dbUser;
    const videoId = parseInt(req.params.videoId as string);
    const existing = await db.select().from(videosTable).where(eq(videosTable.id, videoId)).limit(1);
    if (!existing[0]) { res.status(404).json({ error: "Not found" }); return; }

    if (!(await canEditContent(actor, "video", videoId, existing[0].createdByExternalUserId))) {
      res.status(403).json({ error: "You don't have permission to delete this video." });
      return;
    }

    const mod = await db.select({ trackId: modulesTable.trackId }).from(modulesTable).where(eq(modulesTable.id, existing[0].moduleId)).limit(1);
    logContentChange({
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      action: "delete",
      entityType: "video",
      entityId: existing[0].id,
      entityName: existing[0].title,
      trackId: mod[0]?.trackId ?? null,
    }).catch(() => {});
    await db.delete(videosTable).where(eq(videosTable.id, videoId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
