import {
  db,
  growthTrackEnrollmentsTable,
  growthTrackStepsTable,
  videosTable,
  watchHistoryTable,
  quizResultsTable,
  quizQuestionsTable,
  assignmentsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

/**
 * Checks whether a module is complete for a user.
 * - Module with quiz: complete when quiz is passed
 * - Module without quiz: complete when all videos watched (or no videos)
 */
async function isModuleComplete(userId: string, moduleId: number): Promise<boolean> {
  const [videos, quizQuestions] = await Promise.all([
    db.select().from(videosTable).where(eq(videosTable.moduleId, moduleId)),
    db
      .select({ id: quizQuestionsTable.id })
      .from(quizQuestionsTable)
      .where(eq(quizQuestionsTable.moduleId, moduleId))
      .limit(1),
  ]);

  const hasQuiz = quizQuestions.length > 0;

  if (hasQuiz) {
    const [quizResult] = await db
      .select()
      .from(quizResultsTable)
      .where(and(eq(quizResultsTable.userId, userId), eq(quizResultsTable.moduleId, moduleId)))
      .limit(1);
    return quizResult?.passed === true;
  } else {
    if (videos.length === 0) return true;
    const watchHistory = await db
      .select()
      .from(watchHistoryTable)
      .where(eq(watchHistoryTable.userId, userId));
    const watchMap = new Map(watchHistory.map((w) => [w.videoId, w]));
    return videos.every((v) => watchMap.get(v.id)?.completed === true);
  }
}

/**
 * Called after a module completion event (quiz passed, or all videos watched with no quiz).
 * Checks if this moduleId is the current step in any active growth track enrollment for this user.
 * If complete, assigns the next step's module and advances the enrollment — or marks it done.
 */
export async function checkGrowthTrackProgression(
  userId: string,
  moduleId: number
): Promise<void> {
  try {
    // Find active enrollments where current step === this moduleId
    const enrollments = await db
      .select({
        enrollment: growthTrackEnrollmentsTable,
        step: growthTrackStepsTable,
      })
      .from(growthTrackEnrollmentsTable)
      .innerJoin(
        growthTrackStepsTable,
        and(
          eq(growthTrackStepsTable.growthTrackId, growthTrackEnrollmentsTable.growthTrackId),
          eq(growthTrackStepsTable.stepOrder, growthTrackEnrollmentsTable.currentStepOrder)
        )
      )
      .where(
        and(
          eq(growthTrackEnrollmentsTable.userId, userId),
          eq(growthTrackEnrollmentsTable.status, "active"),
          eq(growthTrackStepsTable.moduleId, moduleId)
        )
      );

    for (const { enrollment } of enrollments) {
      const complete = await isModuleComplete(userId, moduleId);
      if (!complete) continue;

      // Look for the next step in this growth track
      const [nextStep] = await db
        .select()
        .from(growthTrackStepsTable)
        .where(
          and(
            eq(growthTrackStepsTable.growthTrackId, enrollment.growthTrackId),
            eq(growthTrackStepsTable.stepOrder, enrollment.currentStepOrder + 1)
          )
        )
        .limit(1);

      if (nextStep) {
        // Assign the next module (avoid duplicates)
        const [existing] = await db
          .select()
          .from(assignmentsTable)
          .where(
            and(
              eq(assignmentsTable.userId, userId),
              eq(assignmentsTable.moduleId, nextStep.moduleId)
            )
          )
          .limit(1);

        if (!existing) {
          await db.insert(assignmentsTable).values({
            userId,
            moduleId: nextStep.moduleId,
            assignedBy: enrollment.enrolledBy,
          });
        }

        await db
          .update(growthTrackEnrollmentsTable)
          .set({ currentStepOrder: enrollment.currentStepOrder + 1 })
          .where(eq(growthTrackEnrollmentsTable.id, enrollment.id));
      } else {
        // No next step — growth track complete
        await db
          .update(growthTrackEnrollmentsTable)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(growthTrackEnrollmentsTable.id, enrollment.id));
      }
    }
  } catch (err) {
    // Best-effort — do not crash the calling request
    console.error("Growth track progression check failed:", err);
  }
}
