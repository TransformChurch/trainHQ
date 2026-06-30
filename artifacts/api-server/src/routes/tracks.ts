import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, tracksTable, modulesTable, assignmentsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth, requireManagerOrAdmin, getDbUser } from "../middlewares/requireAuth";
import { CreateTrackBody, UpdateTrackBody } from "@workspace/api-zod";
import { logContentChange } from "../lib/auditLog";

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
router.post("/", requireManagerOrAdmin, async (req, res) => {
  try {
    const actor = res.locals.dbUser;
    const parsed = CreateTrackBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const inserted = await db.insert(tracksTable).values(parsed.data).returning();
    const t = inserted[0];
    logContentChange({
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      action: "create",
      entityType: "track",
      entityId: t.id,
      entityName: t.name,
      trackId: t.id,
    }).catch(() => {});
    res.status(201).json({ ...t, createdAt: t.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /tracks/:trackId
router.get("/:trackId", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const trackId = parseInt(req.params.trackId as string);
    const tracks = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId)).limit(1);
    if (!tracks[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const allModules = await db.select().from(modulesTable).where(eq(modulesTable.trackId, trackId)).orderBy(modulesTable.order);

    // Filter private modules: only show if user is admin/manager or has an assignment
    const dbUser = await getDbUser(auth!.userId!);
    let visibleModules = allModules;
    if (dbUser && dbUser.role !== "admin" && dbUser.role !== "manager") {
      const assignments = await db
        .select({ moduleId: assignmentsTable.moduleId })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.userId, dbUser.id));
      const assignedIds = new Set(assignments.map(a => a.moduleId));
      visibleModules = allModules.filter(m => m.isPublic || assignedIds.has(m.id));
    }

    const t = tracks[0];
    res.json({
      ...t,
      createdAt: t.createdAt.toISOString(),
      modules: visibleModules.map(m => ({ ...m, createdAt: m.createdAt.toISOString() })),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /tracks/:trackId
router.patch("/:trackId", requireManagerOrAdmin, async (req, res) => {
  try {
    const actor = res.locals.dbUser;
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
    logContentChange({
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      action: "update",
      entityType: "track",
      entityId: t.id,
      entityName: t.name,
      trackId: t.id,
    }).catch(() => {});
    res.json({ ...t, createdAt: t.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /tracks/:trackId
router.delete("/:trackId", requireManagerOrAdmin, async (req, res) => {
  try {
    const actor = res.locals.dbUser;
    const trackId = parseInt(req.params.trackId as string);
    const existing = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId)).limit(1);
    if (existing[0]) {
      logContentChange({
        actorId: actor.id,
        actorName: `${actor.firstName} ${actor.lastName}`,
        action: "delete",
        entityType: "track",
        entityId: existing[0].id,
        entityName: existing[0].name,
        trackId: existing[0].id,
      }).catch(() => {});
    }
    await db.delete(tracksTable).where(eq(tracksTable.id, trackId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
