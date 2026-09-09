import { db, modulesTable, moduleCompletionsTable, trackCompletionsTable, tracksTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { syncPlanningCenterTrackDateField } from "./planningCenter";

/**
 * Fires after a module is marked complete. If that module's Training Track now has
 * every one of its modules completed by this user for the first time, records the
 * Track completion and syncs the Track's "completed" date to Planning Center (if a
 * field has been configured for it in the Edit Track dialog).
 *
 * Fire-and-forget, mirroring `checkGrowthTrackProgression` — never throws, so it can
 * never block or fail the module-completion request itself.
 */
export async function checkTrackCompletion(userId: string, moduleId: number): Promise<void> {
  try {
    const moduleRows = await db
      .select({ trackId: modulesTable.trackId })
      .from(modulesTable)
      .where(eq(modulesTable.id, moduleId))
      .limit(1);
    const trackId = moduleRows[0]?.trackId;
    if (!trackId) return;

    const trackModules = await db
      .select({ id: modulesTable.id })
      .from(modulesTable)
      .where(eq(modulesTable.trackId, trackId));
    if (trackModules.length === 0) return;

    const completions = await db
      .select({ moduleId: moduleCompletionsTable.moduleId })
      .from(moduleCompletionsTable)
      .where(and(
        eq(moduleCompletionsTable.userId, userId),
        inArray(moduleCompletionsTable.moduleId, trackModules.map((m) => m.id)),
      ));
    const completedIds = new Set(completions.map((c) => c.moduleId));
    const allComplete = trackModules.every((m) => completedIds.has(m.id));
    if (!allComplete) return;

    const alreadyRecorded = await db
      .select({ id: trackCompletionsTable.id })
      .from(trackCompletionsTable)
      .where(and(eq(trackCompletionsTable.userId, userId), eq(trackCompletionsTable.trackId, trackId)))
      .limit(1);
    if (alreadyRecorded[0]) return; // Already synced once — don't re-fire on later re-completions.

    const completedAt = new Date();
    const inserted = await db
      .insert(trackCompletionsTable)
      .values({ userId, trackId, completedAt })
      .onConflictDoNothing({ target: [trackCompletionsTable.userId, trackCompletionsTable.trackId] })
      .returning();
    if (inserted.length === 0) return; // Lost a race with another concurrent completion — already handled.

    const trackRows = await db
      .select({ pcoCompletedFieldId: tracksTable.pcoCompletedFieldId })
      .from(tracksTable)
      .where(eq(tracksTable.id, trackId))
      .limit(1);
    const pcoCompletedFieldId = trackRows[0]?.pcoCompletedFieldId;
    if (!pcoCompletedFieldId) return;

    const userRows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const user = userRows[0];
    if (!user) return;

    const result = await syncPlanningCenterTrackDateField(user, pcoCompletedFieldId, completedAt);
    if (result.status === "failed") {
      console.error("Planning Center track completion sync failed", { userId, trackId, code: result.code });
    }
  } catch (err) {
    console.error("Track completion check failed:", err);
  }
}
