import { Router } from "express";
import { db, quizQuestionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireManagerOrAdmin } from "../middlewares/requireAuth";

const router = Router();

// PATCH /quizzes/questions/:questionId
router.patch("/questions/:questionId", requireManagerOrAdmin, async (req, res) => {
  try {
    const questionId = parseInt(req.params.questionId as string);
    const { questionText, options, correctIndex, order } = req.body as {
      questionText?: string;
      options?: string[];
      correctIndex?: number;
      order?: number;
    };
    const updates: Partial<{ questionText: string; options: string[]; correctIndex: number; order: number }> = {};
    if (questionText !== undefined && typeof questionText === "string" && questionText.trim()) updates.questionText = questionText.trim();
    if (Array.isArray(options) && options.length >= 2) updates.options = options;
    if (correctIndex !== undefined && typeof correctIndex === "number") updates.correctIndex = correctIndex;
    if (order !== undefined && typeof order === "number") updates.order = order;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    const updated = await db
      .update(quizQuestionsTable)
      .set(updates)
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

// DELETE /quizzes/questions/:questionId
router.delete("/questions/:questionId", requireManagerOrAdmin, async (req, res) => {
  try {
    const questionId = parseInt(req.params.questionId as string);
    await db.delete(quizQuestionsTable).where(eq(quizQuestionsTable.id, questionId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
