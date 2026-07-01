import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  db,
  growthTracksTable,
  growthTrackStepsTable,
  growthTrackEnrollmentsTable,
  modulesTable,
  tracksTable,
  assignmentsTable,
  usersTable,
  groupMembersTable,
} from "@workspace/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import { requireAuth, requireManagerOrAdmin, getDbUser } from "../middlewares/requireAuth";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function enrichSteps(steps: typeof growthTrackStepsTable.$inferSelect[]) {
  if (steps.length === 0) return [];
  const moduleIds = [...new Set(steps.map((s) => s.moduleId))];
  const modules = await db
    .select({ module: modulesTable, track: tracksTable })
    .from(modulesTable)
    .leftJoin(tracksTable, eq(modulesTable.trackId, tracksTable.id))
    .where(inArray(modulesTable.id, moduleIds));
  const modMap = new Map(modules.map((m) => [m.module.id, m]));
  return steps
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map((step) => {
      const mod = modMap.get(step.moduleId);
      return {
        ...step,
        module: mod
          ? { id: mod.module.id, title: mod.module.title, trackName: mod.track?.name ?? null }
          : null,
      };
    });
}

async function assignFirstStep(
  growthTrackId: number,
  userId: string,
  enrolledBy: string
): Promise<number | null> {
  const [firstStep] = await db
    .select()
    .from(growthTrackStepsTable)
    .where(eq(growthTrackStepsTable.growthTrackId, growthTrackId))
    .orderBy(asc(growthTrackStepsTable.stepOrder))
    .limit(1);

  if (!firstStep) return null;

  const [existing] = await db
    .select()
    .from(assignmentsTable)
    .where(
      and(eq(assignmentsTable.userId, userId), eq(assignmentsTable.moduleId, firstStep.moduleId))
    )
    .limit(1);

  if (!existing) {
    await db.insert(assignmentsTable).values({
      userId,
      moduleId: firstStep.moduleId,
      assignedBy: enrolledBy,
    });
  }

  return firstStep.stepOrder;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /growth-tracks
router.get("/", requireManagerOrAdmin, async (_req, res) => {
  try {
    const tracks = await db
      .select()
      .from(growthTracksTable)
      .orderBy(asc(growthTracksTable.createdAt));

    const trackIds = tracks.map((t) => t.id);
    const [steps, enrollments] =
      trackIds.length === 0
        ? [[], []]
        : await Promise.all([
            db
              .select()
              .from(growthTrackStepsTable)
              .where(inArray(growthTrackStepsTable.growthTrackId, trackIds)),
            db
              .select()
              .from(growthTrackEnrollmentsTable)
              .where(inArray(growthTrackEnrollmentsTable.growthTrackId, trackIds)),
          ]);

    const stepCounts = new Map<number, number>();
    const enrollmentCounts = new Map<number, number>();
    for (const s of steps) stepCounts.set(s.growthTrackId, (stepCounts.get(s.growthTrackId) ?? 0) + 1);
    for (const e of enrollments)
      enrollmentCounts.set(e.growthTrackId, (enrollmentCounts.get(e.growthTrackId) ?? 0) + 1);

    res.json(
      tracks.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        stepCount: stepCounts.get(t.id) ?? 0,
        enrollmentCount: enrollmentCounts.get(t.id) ?? 0,
      }))
    );
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /growth-tracks
router.post("/", requireManagerOrAdmin, async (req, res) => {
  try {
    const auth = getAuth(req);
    const dbUser = await getDbUser(auth!.userId!);
    if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }

    const { name, description, imageUrl } = req.body as {
      name: unknown; description?: unknown; imageUrl?: unknown;
    };
    if (typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" }); return;
    }

    const [created] = await db
      .insert(growthTracksTable)
      .values({
        name: name.trim(),
        description: typeof description === "string" ? description : null,
        imageUrl: typeof imageUrl === "string" && imageUrl ? imageUrl : null,
        createdBy: dbUser.id,
      })
      .returning();

    res.status(201).json({ ...created, createdAt: created.createdAt.toISOString(), stepCount: 0, enrollmentCount: 0 });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /growth-tracks/:id
router.patch("/:id", requireManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const { name, description, imageUrl } = req.body as Record<string, unknown>;

    const updates: Partial<typeof growthTracksTable.$inferInsert> = {};
    if (typeof name === "string" && name.trim()) updates.name = name.trim();
    if (description !== undefined) updates.description = typeof description === "string" ? description : null;
    if (imageUrl !== undefined) updates.imageUrl = typeof imageUrl === "string" && imageUrl ? imageUrl : null;

    const [updated] = await db
      .update(growthTracksTable)
      .set(updates)
      .where(eq(growthTracksTable.id, id))
      .returning();

    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /growth-tracks/:id
router.delete("/:id", requireManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    // Note: must come before /:id/steps/* routes due to Express ordering
    if (req.params.id === "enrollments") {
      res.status(404).json({ error: "Not found" }); return;
    }
    await db.delete(growthTracksTable).where(eq(growthTracksTable.id, id));
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /growth-tracks/:id/steps
router.get("/:id/steps", requireManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const steps = await db
      .select()
      .from(growthTrackStepsTable)
      .where(eq(growthTrackStepsTable.growthTrackId, id))
      .orderBy(asc(growthTrackStepsTable.stepOrder));
    res.json(await enrichSteps(steps));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /growth-tracks/:id/steps
router.post("/:id/steps", requireManagerOrAdmin, async (req, res) => {
  try {
    const growthTrackId = parseInt(req.params.id as string);
    const { moduleId, stepOrder: givenStepOrder } = req.body as Record<string, unknown>;

    if (typeof moduleId !== "number" || !Number.isInteger(moduleId) || moduleId <= 0) {
      res.status(400).json({ error: "moduleId must be a positive integer" }); return;
    }

    let stepOrder: number;
    if (typeof givenStepOrder === "number" && Number.isInteger(givenStepOrder)) {
      stepOrder = givenStepOrder;
    } else {
      const existing = await db
        .select()
        .from(growthTrackStepsTable)
        .where(eq(growthTrackStepsTable.growthTrackId, growthTrackId))
        .orderBy(asc(growthTrackStepsTable.stepOrder));
      stepOrder = existing.length === 0 ? 1 : existing[existing.length - 1]!.stepOrder + 1;
    }

    const [created] = await db
      .insert(growthTrackStepsTable)
      .values({ growthTrackId, moduleId, stepOrder })
      .returning();

    const [enriched] = await enrichSteps([created]);
    res.status(201).json(enriched);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /growth-tracks/:id/steps/reorder
router.patch("/:id/steps/reorder", requireManagerOrAdmin, async (req, res) => {
  try {
    const updates = req.body as unknown;
    if (!Array.isArray(updates)) { res.status(400).json({ error: "Expected array" }); return; }

    for (const item of updates) {
      if (typeof item.id === "number" && typeof item.stepOrder === "number") {
        await db
          .update(growthTrackStepsTable)
          .set({ stepOrder: item.stepOrder })
          .where(eq(growthTrackStepsTable.id, item.id));
      }
    }
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /growth-tracks/:id/steps/:stepId
router.delete("/:id/steps/:stepId", requireManagerOrAdmin, async (req, res) => {
  try {
    const stepId = parseInt(req.params.stepId as string);
    await db.delete(growthTrackStepsTable).where(eq(growthTrackStepsTable.id, stepId));
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /growth-tracks/:id/enrollments
router.get("/:id/enrollments", requireManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);

    const rows = await db
      .select({ enrollment: growthTrackEnrollmentsTable, user: usersTable })
      .from(growthTrackEnrollmentsTable)
      .innerJoin(usersTable, eq(growthTrackEnrollmentsTable.userId, usersTable.id))
      .where(eq(growthTrackEnrollmentsTable.growthTrackId, id))
      .orderBy(asc(growthTrackEnrollmentsTable.startedAt));

    const totalStepsRows = await db
      .select()
      .from(growthTrackStepsTable)
      .where(eq(growthTrackStepsTable.growthTrackId, id));

    res.json(
      rows.map(({ enrollment, user }) => ({
        id: enrollment.id,
        userId: enrollment.userId,
        userName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        userEmail: user.email,
        status: enrollment.status,
        currentStepOrder: enrollment.currentStepOrder,
        totalSteps: totalStepsRows.length,
        startedAt: enrollment.startedAt.toISOString(),
        completedAt: enrollment.completedAt?.toISOString() ?? null,
      }))
    );
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /growth-tracks/:id/enroll
router.post("/:id/enroll", requireManagerOrAdmin, async (req, res) => {
  try {
    const growthTrackId = parseInt(req.params.id as string);
    const auth = getAuth(req);
    const dbUser = await getDbUser(auth!.userId!);
    if (!dbUser) { res.status(404).json({ error: "User not found" }); return; }

    const { userIds = [], groupIds = [] } = req.body as {
      userIds?: string[]; groupIds?: number[];
    };

    let allUserIds = [...(Array.isArray(userIds) ? userIds.filter((id) => typeof id === "string") : [])];

    if (Array.isArray(groupIds) && groupIds.length > 0) {
      const validGroupIds = groupIds.filter((id) => typeof id === "number");
      if (validGroupIds.length > 0) {
        const members = await db
          .select({ userId: groupMembersTable.userId })
          .from(groupMembersTable)
          .where(inArray(groupMembersTable.groupId, validGroupIds));
        allUserIds = [...new Set([...allUserIds, ...members.map((m) => m.userId)])];
      }
    }

    if (allUserIds.length === 0) {
      res.status(400).json({ error: "No users to enroll" }); return;
    }

    const existingEnrollments = await db
      .select({ userId: growthTrackEnrollmentsTable.userId })
      .from(growthTrackEnrollmentsTable)
      .where(
        and(
          eq(growthTrackEnrollmentsTable.growthTrackId, growthTrackId),
          inArray(growthTrackEnrollmentsTable.userId, allUserIds)
        )
      );
    const alreadyEnrolled = new Set(existingEnrollments.map((e) => e.userId));
    const newUserIds = allUserIds.filter((id) => !alreadyEnrolled.has(id));

    let enrolled = 0;
    for (const userId of newUserIds) {
      const firstStepOrder = await assignFirstStep(growthTrackId, userId, dbUser.id);
      if (firstStepOrder === null) continue;

      await db.insert(growthTrackEnrollmentsTable).values({
        growthTrackId,
        userId,
        enrolledBy: dbUser.id,
        currentStepOrder: firstStepOrder,
        status: "active",
      });
      enrolled++;
    }

    res.json({ enrolled, skipped: allUserIds.length - newUserIds.length });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /growth-tracks/enrollments/:enrollmentId
router.delete("/enrollments/:enrollmentId", requireManagerOrAdmin, async (req, res) => {
  try {
    const enrollmentId = parseInt(req.params.enrollmentId as string);
    await db
      .delete(growthTrackEnrollmentsTable)
      .where(eq(growthTrackEnrollmentsTable.id, enrollmentId));
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
