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
    const fromAddr = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
    const dueLine = dueDate
      ? `<p><strong>Due:</strong> ${new Date(dueDate).toLocaleDateString()}</p>`
      : "";
    const moduleListHtml = moduleTitles.map((title) => `<li>${title}</li>`).join("");
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Transform Church <${fromAddr}>`,
        to: toEmail,
        subject: `New Training Track Assigned: ${trackName}`,
        html: `
          <h2>You've been assigned a new training track</h2>
          <p>Hi ${toName},</p>
          <p>A new training track has been assigned to you:</p>
          <p><strong>${trackName}</strong></p>
          ${dueLine}
          <p>It includes the following modules:</p>
          <ul>${moduleListHtml}</ul>
          <p>Log in to your Transform Church training portal to get started.</p>
        `,
      }),
    });
  } catch (err) {
    console.error("Failed to send track assignment email:", err);
  }
}

// PATCH /admin/tracks/:trackId/planning-center-fields — choose which Planning Center
// "People" custom fields this Track's assigned/completed dates sync to. Same edit
// permission as the existing Track PATCH route (admin, or the manager who created it /
// was granted access).
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
  } catch (err) {
    req.log.error({ err }, "Failed to update track Planning Center fields");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/tracks/:trackId/assign — assign every selected module in a Track to a set
// of users (or a group) in one action, and record a Track-level "assigned" date that
// syncs to Planning Center (in addition to each module's own existing per-module sync).
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

    // Defense in depth: only ever assign modules that actually belong to this track.
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
      const members = await db
        .select({ userId: groupMembersTable.userId })
        .from(groupMembersTable)
        .where(eq(groupMembersTable.groupId, body.groupId));
      userIds = [...new Set([...userIds, ...members.map((m) => m.userId)])];
    }
    if (userIds.length === 0) {
      res.status(400).json({ error: "No users to assign" });
      return;
    }

    const results = [];
    for (const userId of userIds) {
      const targetUsers = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      const targetUser = targetUsers[0];

      const moduleResults = [];
      for (const moduleData of trackModules) {
        const moduleId = moduleData.id;

        if (resetProgress) {
          await db.delete(quizResultsTable)
            .where(and(eq(quizResultsTable.userId, userId), eq(quizResultsTable.moduleId, moduleId)));
          const moduleVideos = await db
            .select({ id: videosTable.id })
            .from(videosTable)
            .where(eq(videosTable.moduleId, moduleId));
          if (moduleVideos.length > 0) {
            await db.delete(watchHistoryTable)
              .where(and(
                eq(watchHistoryTable.userId, userId),
                inArray(watchHistoryTable.videoId, moduleVideos.map((v) => v.id)),
              ));
          }
        }

        const existingAssignment = await db
          .select()
          .from(assignmentsTable)
          .where(and(eq(assignmentsTable.userId, userId), eq(assignmentsTable.moduleId, moduleId)))
          .limit(1);

        let a;
        if (existingAssignment[0]) {
          const updateValues: Partial<typeof assignmentsTable.$inferInsert & { seenAt: Date | null; assignedAt: Date }> = {
            assignedBy: actor.id,
            assignedAt: new Date(),
            dueDate: dueDate ? new Date(dueDate) : null,
          };
          if (resetProgress) updateValues.seenAt = null;
          const updatedRows = await db
            .update(assignmentsTable)
            .set(updateValues)
            .where(eq(assignmentsTable.id, existingAssignment[0].id))
            .returning();
          a = updatedRows[0];
        } else {
          const insertedRows = await db.insert(assignmentsTable).values({
            userId,
            moduleId,
            assignedBy: actor.id,
            dueDate: dueDate ? new Date(dueDate) : null,
          }).returning();
          a = insertedRows[0];
        }

        const planningCenterSync = targetUser
          ? await syncPlanningCenterModuleAssignment(targetUser, moduleId, a.assignedAt)
          : {
              status: "failed" as const,
              code: "assignment_user_missing",
              message: "The assigned member could not be found.",
            };
        if (planningCenterSync.status === "failed") {
          req.log.warn({ userId, moduleId, code: planningCenterSync.code }, "Planning Center assignment sync failed");
        }

        moduleResults.push({
          moduleId,
          assignmentId: a.id,
          assignedAt: a.assignedAt.toISOString(),
          planningCenterSync,
        });
      }

      const trackAssignedAt = new Date();
      await db
        .insert(trackAssignmentsTable)
        .values({ userId, trackId, assignedBy: actor.id, assignedAt: trackAssignedAt })
        .onConflictDoUpdate({
          target: [trackAssignmentsTable.userId, trackAssignmentsTable.trackId],
          set: { assignedBy: actor.id, assignedAt: trackAssignedAt },
        });

      const trackPlanningCenterSync = targetUser
        ? await syncPlanningCenterTrackDateField(targetUser, track.pcoAssignedFieldId, trackAssignedAt)
        : {
            status: "failed" as const,
            code: "assignment_user_missing",
            message: "The assigned member could not be found.",
          };
      if (trackPlanningCenterSync.status === "failed") {
        req.log.warn({ userId, trackId, code: trackPlanningCenterSync.code }, "Planning Center track assignment sync failed");
      }

      if (notifyEmail && targetUser) {
        sendTrackAssignmentEmail(
          targetUser.email,
          `${targetUser.firstName} ${targetUser.lastName}`,
          track.name,
          trackModules.map((m) => m.title),
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
