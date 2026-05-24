import { Router } from "express";
import { db, quizQuestionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";
import { UpdateQuizQuestionBody } from "@workspace/api-zod";

const router = Router();

// PATCH /quizzes/questions/:questionId (admin only)
router.patch("/questions/:questionId", requireAdmin, async (req, res) => {
  try {
    const questionId = parseInt(req.params.questionId as string);
    const parsed = UpdateQuizQuestionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const updated = await db
      .update(quizQuestionsTable)
      .set(parsed.data)
      .where(eq(quizQuestionsTable.id, questionId))
      .returning();
    if (!updated[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(updated[0]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /quizzes/questions/:questionId (admin only)
router.delete("/questions/:questionId", requireAdmin, async (req, res) => {
  try {
    const questionId = parseInt(req.params.questionId as string);
    await db.delete(quizQuestionsTable).where(eq(quizQuestionsTable.id, questionId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
