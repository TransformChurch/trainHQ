import { Router } from "express";
import { getAuth } from "../middlewares/auth";
import { db, modulesTable, videosTable, watchHistoryTable, quizResultsTable, queueTable, quizQuestionsTable, assignmentsTable, moduleCompletionsTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth, requireManagerOrAdmin, getDbUser } from "../middlewares/requireAuth";
import { CreateModuleBody, UpdateModuleBody, CreateQuizQuestionBody, SubmitQuizBody, CompleteModuleBody } from "@workspace/api-zod";
import { logContentChange } from "../lib/auditLog";
import { checkGrowthTrackProgression } from "../lib/growthTrackProgression";
import { canEditContent } from "../lib/canEditContent";
import { PlanningCenterError, updatePlanningCenterModuleCompletion } from "../lib/planningCenter";

const router = Router();

// GET /modules
// Admins/Managers: see all; Students: see public modules + any private modules they're assigned to
router.get("/", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const dbUser = await getDbUser(auth!.userId!);
    const trackId = req.query.trackId ? parseInt(req.query.trackId as string) : undefined;

    let modules;
    if (dbUser?.role === "admin" || dbUser?.role === "manager") {
      // Admins/Managers see everything
      const query = trackId
        ? db.select().from(modulesTable).where(eq(modulesTable.trackId, trackId)).orderBy(modulesTable.order)
        : db.select().from(modulesTable).orderBy(modulesTable.order);
      modules = await query;
    } else {
      // Students: get their assigned module IDs first
      const assignments = dbUser
        ? await db.select({ moduleId: assignmentsTable.moduleId }).from(assignmentsTable).where(eq(assignmentsTable.userId, dbUser.id))
        : [];
      const assignedIds = assignments.map(a => a.moduleId);

      // Then fetch modules that are public OR assigned to this user
      const allModules = trackId
        ? await db.select().from(modulesTable).where(eq(modulesTable.trackId, trackId)).orderBy(modulesTable.order)
        : await db.select().from(modulesTable).orderBy(modulesTable.order);

      modules = allModules.filter(m => m.isPublic || assignedIds.includes(m.id));
    }

    res.json(modules.map(m => ({ ...m, createdAt: m.createdAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /modules
router.post("/", requireManagerOrAdmin, async (req, res) => {
  try {
    const auth = getAuth(req);
    const actor = res.locals.dbUser;
    const parsed = CreateModuleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const inserted = await db.insert(modulesTable).values({ ...parsed.data, createdByExternalUserId: auth!.userId! }).returning();
    const m = inserted[0];
    logContentChange({
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      action: "create",
      entityType: "module",
      entityId: m.id,
      entityName: m.title,
      trackId: m.trackId,
    }).catch(() => {});
    res.status(201).json({ ...m, createdAt: m.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /modules/complete — sync completion to Planning Center, then persist locally
router.post("/complete", requireAuth, async (req, res) => {
  try {
    const parsed = CompleteModuleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const auth = getAuth(req);
    const dbUser = await getDbUser(auth!.userId!);
    if (!dbUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const moduleId = parsed.data.moduleId;
    const moduleRows = await db.select({
      id: modulesTable.id,
      isPublic: modulesTable.isPublic,
    })
      .from(modulesTable)
      .where(eq(modulesTable.id, moduleId))
      .limit(1);
    if (!moduleRows[0]) {
      res.status(404).json({ error: "Module not found" });
      return;
    }
    if (dbUser.role === "student" && !moduleRows[0].isPublic) {
      const assignment = await db.select({ id: assignmentsTable.id })
        .from(assignmentsTable)
        .where(and(
          eq(assignmentsTable.moduleId, moduleId),
          eq(assignmentsTable.userId, dbUser.id),
        ))
        .limit(1);
      if (!assignment[0]) {
        res.status(403).json({ error: "You do not have access to this module" });
        return;
      }
    }

    const moduleVideos = await db.select({ id: videosTable.id })
      .from(videosTable)
      .where(eq(videosTable.moduleId, moduleId));
    if (moduleVideos.length > 0) {
      const completedVideos = await db.select({ videoId: watchHistoryTable.videoId })
        .from(watchHistoryTable)
        .where(and(
          eq(watchHistoryTable.userId, dbUser.id),
          eq(watchHistoryTable.completed, true),
          inArray(watchHistoryTable.videoId, moduleVideos.map((video) => video.id)),
        ));
      if (new Set(completedVideos.map((row) => row.videoId)).size !== moduleVideos.length) {
        res.status(409).json({
          error: "Complete every video in this module before marking it complete",
          code: "module_videos_incomplete",
        });
        return;
      }
    }

    const quizQuestion = await db.select({ id: quizQuestionsTable.id })
      .from(quizQuestionsTable)
      .where(eq(quizQuestionsTable.moduleId, moduleId))
      .limit(1);
    if (quizQuestion[0]) {
      const passedQuiz = await db.select({ id: quizResultsTable.id })
        .from(quizResultsTable)
        .where(and(
          eq(quizResultsTable.userId, dbUser.id),
          eq(quizResultsTable.moduleId, moduleId),
          eq(quizResultsTable.passed, true),
        ))
        .limit(1);
      if (!passedQuiz[0]) {
        res.status(409).json({
          error: "Pass the knowledge check before marking this module complete",
          code: "module_quiz_incomplete",
        });
        return;
      }
    }

    const completedAt = new Date();
    await updatePlanningCenterModuleCompletion(dbUser, moduleId, completedAt);
    const saved = await db.insert(moduleCompletionsTable).values({
      userId: dbUser.id,
      moduleId,
      completedAt,
    }).onConflictDoUpdate({
      target: [moduleCompletionsTable.userId, moduleCompletionsTable.moduleId],
      set: { completedAt },
    }).returning();

    void checkGrowthTrackProgression(dbUser.id, moduleId);
    res.json({
      moduleId,
      completedAt: saved[0].completedAt.toISOString(),
      planningCenterSynced: true,
    });
  } catch (err) {
    if (err instanceof PlanningCenterError) {
      req.log.warn({ code: err.code }, "Planning Center module completion sync failed");
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    req.log.error({ err }, "Module completion failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /modules/:moduleId
router.get("/:moduleId", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const moduleId = parseInt(req.params.moduleId as string);
    const modules = await db.select().from(modulesTable).where(eq(modulesTable.id, moduleId)).limit(1);
    if (!modules[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const mod = modules[0];

    const videos = await db.select().from(videosTable).where(eq(videosTable.moduleId, moduleId)).orderBy(videosTable.order);

    const dbUser = await getDbUser(auth!.userId!);
    const userId = dbUser?.id ?? "";

    const watchHistory = userId
      ? await db.select().from(watchHistoryTable).where(eq(watchHistoryTable.userId, userId))
      : [];

    const queueItems = userId
      ? await db.select().from(queueTable).where(eq(queueTable.userId, userId))
      : [];

    const quizResults = userId
      ? await db.select().from(quizResultsTable).where(and(eq(quizResultsTable.userId, userId), eq(quizResultsTable.moduleId, moduleId))).limit(1)
      : [];
    const quizResult = quizResults[0] ?? null;
    const moduleCompletions = userId
      ? await db.select().from(moduleCompletionsTable).where(and(
          eq(moduleCompletionsTable.userId, userId),
          eq(moduleCompletionsTable.moduleId, moduleId),
        )).limit(1)
      : [];

    const watchMap = new Map(watchHistory.map(w => [w.videoId, w]));
    const queueMap = new Set(queueItems.map(q => q.videoId));

    const anyNeedsReview = videos.some(v => watchMap.get(v.id)?.needsReview === true);
    const allCompleted = videos.length === 0 || videos.every(v => watchMap.get(v.id)?.completed);
    const quizUnlocked = allCompleted && !anyNeedsReview;
    const lockedReason = !allCompleted
      ? "complete_videos"
      : anyNeedsReview
      ? "needs_review"
      : null;

    res.json({
      ...mod,
      createdAt: mod.createdAt.toISOString(),
      moduleCompletedAt: moduleCompletions[0]?.completedAt.toISOString() ?? null,
      videos: videos.map(v => {
        const wh = watchMap.get(v.id);
        return {
          ...v,
          createdAt: v.createdAt.toISOString(),
          progressPercent: wh?.progressPercent ?? null,
          completed: wh?.completed ?? false,
          needsReview: wh?.needsReview ?? false,
          inQueue: queueMap.has(v.id),
        };
      }),
      quizResult: quizResult
        ? { ...quizResult, takenAt: quizResult.takenAt.toISOString() }
        : null,
      quizUnlocked,
      lockedReason,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /modules/:moduleId
router.patch("/:moduleId", requireManagerOrAdmin, async (req, res) => {
  try {
    const actor = res.locals.dbUser;
    const moduleId = parseInt(req.params.moduleId as string);

    const existing = await db.select().from(modulesTable).where(eq(modulesTable.id, moduleId)).limit(1);
    if (!existing[0]) { res.status(404).json({ error: "Not found" }); return; }
    if (!(await canEditContent(actor, "module", moduleId, existing[0].createdByExternalUserId))) {
      res.status(403).json({ error: "You don't have permission to edit this module." });
      return;
    }

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
    logContentChange({
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      action: "update",
      entityType: "module",
      entityId: m.id,
      entityName: m.title,
      trackId: m.trackId,
    }).catch(() => {});
    res.json({ ...m, createdAt: m.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /modules/:moduleId
router.delete("/:moduleId", requireManagerOrAdmin, async (req, res) => {
  try {
    const actor = res.locals.dbUser;
    const moduleId = parseInt(req.params.moduleId as string);
    const existing = await db.select().from(modulesTable).where(eq(modulesTable.id, moduleId)).limit(1);
    if (!existing[0]) { res.status(404).json({ error: "Not found" }); return; }
    if (!(await canEditContent(actor, "module", moduleId, existing[0].createdByExternalUserId))) {
      res.status(403).json({ error: "You don't have permission to delete this module." });
      return;
    }
    if (existing[0]) {
      logContentChange({
        actorId: actor.id,
        actorName: `${actor.firstName} ${actor.lastName}`,
        action: "delete",
        entityType: "module",
        entityId: existing[0].id,
        entityName: existing[0].title,
        trackId: existing[0].trackId,
      }).catch(() => {});
    }
    await db.delete(modulesTable).where(eq(modulesTable.id, moduleId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /modules/:moduleId/quiz — correctIndex is intentionally excluded for students
router.get("/:moduleId/quiz", requireAuth, async (req, res) => {
  try {
    const moduleId = parseInt(req.params.moduleId as string);
    const questions = await db
      .select()
      .from(quizQuestionsTable)
      .where(eq(quizQuestionsTable.moduleId, moduleId))
      .orderBy(quizQuestionsTable.order);
    res.json(questions.map(({ correctIndex: _answer, ...safe }) => safe));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /modules/:moduleId/quiz (add question)
router.post("/:moduleId/quiz", requireManagerOrAdmin, async (req, res) => {
  try {
    const moduleId = parseInt(req.params.moduleId as string);
    const parsed = CreateQuizQuestionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const inserted = await db.insert(quizQuestionsTable).values({ moduleId, ...parsed.data }).returning();
    res.status(201).json(inserted[0]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /modules/:moduleId/quiz/submit
router.post("/:moduleId/quiz/submit", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const moduleId = parseInt(req.params.moduleId as string);
    const parsed = SubmitQuizBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const dbUser = await getDbUser(auth!.userId!);
    if (!dbUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Check quiz is unlocked (all videos completed, none needsReview)
    const videos = await db.select().from(videosTable).where(eq(videosTable.moduleId, moduleId));
    const watchHistory = await db
      .select()
      .from(watchHistoryTable)
      .where(eq(watchHistoryTable.userId, dbUser.id));
    const watchMap = new Map(watchHistory.map(w => [w.videoId, w]));

    const allCompleted = videos.length === 0 || videos.every(v => watchMap.get(v.id)?.completed);
    const anyNeedsReview = videos.some(v => watchMap.get(v.id)?.needsReview === true);

    if (!allCompleted && videos.length > 0) {
      res.status(400).json({ error: "Complete all videos before taking the quiz" });
      return;
    }
    if (anyNeedsReview) {
      res.status(400).json({ error: "Re-watch all videos marked 'Needs Review' before retaking the quiz" });
      return;
    }

    // Grade the quiz
    const questions = await db.select().from(quizQuestionsTable).where(eq(quizQuestionsTable.moduleId, moduleId));
    const { answers } = parsed.data;
    let score = 0;
    for (const answer of answers) {
      const question = questions.find(q => q.id === answer.questionId);
      if (question && question.correctIndex === answer.selectedIndex) {
        score++;
      }
    }
    const totalQuestions = questions.length;
    const passed = totalQuestions > 0 && (score / totalQuestions) >= 0.8;

    // Save result (upsert, incrementing attempts)
    const existing = await db
      .select()
      .from(quizResultsTable)
      .where(and(eq(quizResultsTable.userId, dbUser.id), eq(quizResultsTable.moduleId, moduleId)))
      .limit(1);

    let result;
    if (existing[0]) {
      const updated = await db
        .update(quizResultsTable)
        .set({
          score,
          totalQuestions,
          passed,
          takenAt: new Date(),
          attempts: sql`${quizResultsTable.attempts} + 1`,
        })
        .where(and(eq(quizResultsTable.userId, dbUser.id), eq(quizResultsTable.moduleId, moduleId)))
        .returning();
      result = updated[0];
    } else {
      const inserted = await db
        .insert(quizResultsTable)
        .values({ userId: dbUser.id, moduleId, score, totalQuestions, passed, attempts: 1 })
        .returning();
      result = inserted[0];
    }

    // If quiz failed: mark all completed videos in this module as needsReview
    if (!passed && videos.length > 0) {
      for (const video of videos) {
        const wh = watchMap.get(video.id);
        if (wh?.completed) {
          await db
            .update(watchHistoryTable)
            .set({ needsReview: true })
            .where(and(eq(watchHistoryTable.userId, dbUser.id), eq(watchHistoryTable.videoId, video.id)));
        }
      }
    }

    // Trigger growth track auto-progression if quiz passed
    if (passed) {
      void checkGrowthTrackProgression(dbUser.id, moduleId);
    }

    res.json({ ...result, takenAt: result.takenAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /modules/:moduleId/quiz/result
router.get("/:moduleId/quiz/result", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const moduleId = parseInt(req.params.moduleId as string);
    const dbUser = await getDbUser(auth!.userId!);
    if (!dbUser) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const results = await db
      .select()
      .from(quizResultsTable)
      .where(and(eq(quizResultsTable.userId, dbUser.id), eq(quizResultsTable.moduleId, moduleId)))
      .limit(1);
    if (!results[0]) {
      res.status(404).json({ error: "Not taken yet" });
      return;
    }
    res.json({ ...results[0], takenAt: results[0].takenAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
