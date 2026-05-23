import { Router } from "express";
import { db, quizQuestionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";

const router = Router();

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
