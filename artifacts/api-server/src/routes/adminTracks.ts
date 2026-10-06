import { Router } from "express";
import {
  db,
  usersTable,
  tracksTable,
  modulesTable,
  assignmentsTable,
  quizResultsTable,
  watchHistoryTable,
  videosTable,
  groupMembersTable,
  trackAssignmentsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireManagerOrAdmin } from "../middlewares/requireAuth";
import { canEditContent } from "../lib/canEditContent";
import { logContentChange } from "../lib/auditLog";
import {
  syncPlanningCenterModuleAssignment,
  syncPlanningCenterTrackDateField,
} from "../lib/planningCenter";
import { resolveFromHeader } from "../lib/email";

const router = Router();

async function sendTrackAssignmentEmail(
  toEmail: string,
  toName: string,
  trackName: string,
  moduleTitles: string[],
  dueDate: string | null,
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    const from = resolveFromHeader();
    if (!from) {
      console.error("Skipping assignment email: EMAIL_FROM is not a valid sender address");
      return;
    }
    const dueLine = dueDate ? `<p><strong>Due:</strong> ${new Date(dueDate).toLocaleDateString()}</p>` : "";
    const moduleListHtml = moduleTitles.map((title) => `<li>${title}</li>`).join("");
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: toEmail,
        subject: `New Training Track Assigned: ${trackName}`,
        html: `<h2>You've been assigned a new training track</h2><p>Hi ${toName},</p><p>A new training track has been assigned to you:</p><p><strong>${trackName}</strong></p>${dueLine}<p>It includes the following modules:</p><ul>${moduleListHtml}</ul><p>Log in to your Transform Church training portal to get started.</p>`,
      }),
    });
  } catch (err) {
    console.error("Failed to send track assignment email:", err);
  }
}

router.patch("/:trackId/planning-center-fields", requireManagerOrAdmin, async (req, res) => {
  try {
    const actor = res.locals.dbUser;
    const trackId = parseInt(req.params.trackId as string);
    const existing = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId)).limit(1);
    if (!existing[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!(await canEditContent(actor, "track", trackId, existing[0].createdByExternalUserId))) {
      res.status(403).json({ error: "You don't have permission to edit this track." });
      return;
    }
    const body = req.body as { pcoAssignedFieldId?: string | null; pcoCompletedFieldId?: string | null };
    const normalize = (value: unknown): string | null =>
      typeof value === "string" && value.trim() ? value.trim() : null;
    const updated = await db
      .update(tracksTable)
      .set({
        pcoAssignedFieldId: normalize(body.pcoAssignedFieldId),
        pcoCompletedFieldId: normalize(body.pcoCompletedFieldId),
      })
      .where(eq(tracksTable.id, trackId))
      .returning();
    const track = updated[0];
    logContentChange({
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      action: "update",
      entityType: "track",
      entityId: track.id,
      entityName: track.name,
      trackId: track.id,
    }).catch(() => {});
    res.json({ ...track, createdAt: track.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to update track Planning Center fields");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:trackId/assign", requireManagerOrAdmin, async (req, res) => {
  try {
    const actor = res.locals.dbUser;
    const trackId = parseInt(req.params.trackId as string);
    const body = req.body as {
      userIds?: string[];
      groupId?: number;
      moduleIds?: number[];
      dueDate?: string | null;
      notifyEmail?: boolean;
      resetProgress?: boolean;
    };
    const trackRows = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId)).limit(1);
    const track = trackRows[0];
    if (!track) {
      res.status(404).json({ error: "Track not found" });
      return;
    }
    const requestedModuleIds = Array.isArray(body.moduleIds) ? body.moduleIds : [];
    if (requestedModuleIds.length === 0) {
      res.status(400).json({ error: "Select at least one module to assign" });
      return;
    }
    const trackModules = await db
      .select()
      .from(modulesTable)
      .where(and(eq(modulesTable.trackId, trackId), inArray(modulesTable.id, requestedModuleIds)))
      .orderBy(modulesTable.order);
    if (trackModules.length === 0) {
      res.status(400).json({ error: "None of the selected modules belong to this track" });
      return;
    }
    const dueDate = body.dueDate ?? null;
    const notifyEmail = body.notifyEmail ?? false;
    const resetProgress = body.resetProgress ?? false;
    let userIds: string[] = Array.isArray(body.userIds) ? body.userIds : [];
    if (body.groupId) {
      const members = await db.select({ userId: groupMembersTable.userId })
        .from(groupMembersTable).where(eq(groupMembersTable.groupId, body.groupId));
      userIds = [...new Set([...userIds, ...members.map((member) => member.userId)])];
    }
    if (userIds.length === 0) {
      res.status(400).json({ error: "No users to assign" });
      return;
    }

    const moduleIds = trackModules.map((moduleData) => moduleData.id);

    // Audit findings 1.8/2.5: these three lookups used to run once PER USER
    // (moduleVideos: once per user PER MODULE) even though none of them
    // depend on which user is currently being processed, only on
    // membership in a fixed set. Batched to a handful of queries total
    // instead of O(userIds.length) / O(userIds.length * trackModules.length)
    // -- same data, same results, far fewer round trips to the database.
    const targetUserRows = await db.select().from(usersTable).where(inArray(usersTable.id, userIds));
    const targetUserById = new Map(targetUserRows.map((user) => [user.id, user]));

    // assignmentsTable has no unique constraint on (userId, moduleId), so in
    // the (believed impossible in practice, but not DB-enforced) case of
    // duplicate rows for the same pair, keep the lowest-id row -- the
    // closest reasonable match to the original per-pair `.limit(1)` query's
    // likely behavior on an un-ordered scan of a small table.
    const existingAssignmentRows = await db.select().from(assignmentsTable)
      .where(and(inArray(assignmentsTable.userId, userIds), inArray(assignmentsTable.moduleId, moduleIds)))
      .orderBy(assignmentsTable.id);
    const existingAssignmentByKey = new Map<string, typeof existingAssignmentRows[number]>();
    for (const row of existingAssignmentRows) {
      const key = `${row.userId}:${row.moduleId}`;
      if (!existingAssignmentByKey.has(key)) existingAssignmentByKey.set(key, row);
    }

    const moduleVideoIdsByModule = new Map<number, number[]>();
    if (resetProgress) {
      const videoRows = await db.select({ id: videosTable.id, moduleId: videosTable.moduleId })
        .from(videosTable)
        .where(inArray(videosTable.moduleId, moduleIds));
      for (const video of videoRows) {
        const list = moduleVideoIdsByModule.get(video.moduleId);
        if (list) list.push(video.id);
        else moduleVideoIdsByModule.set(video.moduleId, [video.id]);
      }
    }

    // Audit finding 1.7 (Critical): for N users x M modules, this handler
    // used to fire N*M+N sequential PCO calls (module-assignment sync per
    // user per module, plus a track-date-field sync per user) with zero
    // delay between them -- easily hundreds of calls in one HTTP request,
    // virtually guaranteed to hit Planning Center's rate limit. The
    // underlying client (planningCenter.ts) now retries a 429 with backoff
    // on its own, but spacing calls out here avoids burning that retry
    // budget and spreads the load instead of bursting it.
    const PCO_SYNC_DELAY_MS = 200;
    let pcoCallCount = 0;
    async function pacedPcoSync<T>(run: () => Promise<T>): Promise<T> {
      if (pcoCallCount > 0) await new Promise((resolve) => setTimeout(resolve, PCO_SYNC_DELAY_MS));
      pcoCallCount += 1;
      return run();
    }

    const results = [];
    for (const userId of userIds) {
      const targetUser = targetUserById.get(userId);
      const moduleResults = [];
      for (const moduleData of trackModules) {
        const moduleId = moduleData.id;
        if (resetProgress) {
          await db.delete(quizResultsTable)
            .where(and(eq(quizResultsTable.userId, userId), eq(quizResultsTable.moduleId, moduleId)));
          const moduleVideoIds = moduleVideoIdsByModule.get(moduleId) ?? [];
          if (moduleVideoIds.length > 0) {
            await db.delete(watchHistoryTable).where(and(
              eq(watchHistoryTable.userId, userId),
              inArray(watchHistoryTable.videoId, moduleVideoIds),
            ));
          }
        }
        const existingAssignment = existingAssignmentByKey.get(`${userId}:${moduleId}`);
        let assignment;
        if (existingAssignment) {
          const updateValues: Partial<typeof assignmentsTable.$inferInsert & { seenAt: Date | null; assignedAt: Date }> = {
            assignedBy: actor.id,
            assignedAt: new Date(),
            dueDate: dueDate ? new Date(dueDate) : null,
          };
          if (resetProgress) updateValues.seenAt = null;
          const updatedRows = await db.update(assignmentsTable).set(updateValues)
            .where(eq(assignmentsTable.id, existingAssignment.id)).returning();
          assignment = updatedRows[0];
        } else {
          const insertedRows = await db.insert(assignmentsTable).values({
            userId,
            moduleId,
            assignedBy: actor.id,
            dueDate: dueDate ? new Date(dueDate) : null,
          }).returning();
          assignment = insertedRows[0];
        }
        const planningCenterSync = targetUser
          ? await pacedPcoSync(() => syncPlanningCenterModuleAssignment(targetUser, moduleId, assignment.assignedAt))
          : { status: "failed" as const, code: "assignment_user_missing", message: "The assigned member could not be found." };
        moduleResults.push({
          moduleId,
          assignmentId: assignment.id,
          assignedAt: assignment.assignedAt.toISOString(),
          planningCenterSync,
        });
      }

      const trackAssignedAt = new Date();
      await db.insert(trackAssignmentsTable)
        .values({ userId, trackId, assignedBy: actor.id, assignedAt: trackAssignedAt })
        .onConflictDoUpdate({
          target: [trackAssignmentsTable.userId, trackAssignmentsTable.trackId],
          set: { assignedBy: actor.id, assignedAt: trackAssignedAt },
        });
      const trackPlanningCenterSync = targetUser
        ? await pacedPcoSync(() => syncPlanningCenterTrackDateField(targetUser, track.pcoAssignedFieldId, trackAssignedAt))
        : { status: "failed" as const, code: "assignment_user_missing", message: "The assigned member could not be found." };
      if (notifyEmail && targetUser) {
        sendTrackAssignmentEmail(
          targetUser.email,
          `${targetUser.firstName} ${targetUser.lastName}`,
          track.name,
          trackModules.map((module) => module.title),
          dueDate,
        ).catch(() => {});
      }
      results.push({
        userId,
        trackAssignedAt: trackAssignedAt.toISOString(),
        trackPlanningCenterSync,
        modules: moduleResults,
      });
    }
    res.status(201).json(results);
  } catch (err) {
    req.log.error({ err }, "Admin track assignment failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;