import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, quizQuestionsTable, quizResultsTable, watchHistoryTable, videosTable, modulesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin, getDbUser } from "../middlewares/requireAuth";
import { CreateQuizQuestionBody, SubmitQuizBody } from "@workspace/api-zod";

const router = Router();

// GET /modules/:moduleId/quiz
router.get("/modules/:moduleId/quiz", requireAuth, async (req, res) => {
  try {
    const moduleId = parseInt(req.params.moduleId);
    const questions = await db
      .select()
      .from(quizQuestionsTable)
      .where(eq(quizQuestionsTable.moduleId, moduleId))
      .orderBy(quizQuestionsTable.order);
    res.json(questions);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /modules/:moduleId/quiz (add question - admin)
router.post("/modules/:moduleId/quiz", requireAdmin, async (req, res) => {
  try {
    const moduleId = parseInt(req.params.moduleId);
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
router.post("/modules/:moduleId/quiz/submit", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const moduleId = parseInt(req.params.moduleId);
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

    // Check quiz is unlocked (all videos completed)
    const videos = await db.select().from(videosTable).where(eq(videosTable.moduleId, moduleId));
    const watchHistory = await db
      .select()
      .from(watchHistoryTable)
      .where(eq(watchHistoryTable.userId, dbUser.id));
    const watchMap = new Map(watchHistory.map(w => [w.videoId, w]));
    const allCompleted = videos.length === 0 || videos.every(v => watchMap.get(v.id)?.completed);

    if (!allCompleted && videos.length > 0) {
      res.status(400).json({ error: "Complete all videos before taking the quiz" });
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

    // Save result (upsert)
    const existing = await db
      .select()
      .from(quizResultsTable)
      .where(and(eq(quizResultsTable.userId, dbUser.id), eq(quizResultsTable.moduleId, moduleId)))
      .limit(1);

    let result;
    if (existing[0]) {
      const updated = await db
        .update(quizResultsTable)
        .set({ score, totalQuestions, passed, takenAt: new Date() })
        .where(and(eq(quizResultsTable.userId, dbUser.id), eq(quizResultsTable.moduleId, moduleId)))
        .returning();
      result = updated[0];
    } else {
      const inserted = await db
        .insert(quizResultsTable)
        .values({ userId: dbUser.id, moduleId, score, totalQuestions, passed })
        .returning();
      result = inserted[0];
    }

    res.json({ ...result, takenAt: result.takenAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /modules/:moduleId/quiz/result
router.get("/modules/:moduleId/quiz/result", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const moduleId = parseInt(req.params.moduleId);
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

// DELETE /quizzes/questions/:questionId
router.delete("/questions/:questionId", requireAdmin, async (req, res) => {
  try {
    const questionId = parseInt(req.params.questionId);
    await db.delete(quizQuestionsTable).where(eq(quizQuestionsTable.id, questionId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
