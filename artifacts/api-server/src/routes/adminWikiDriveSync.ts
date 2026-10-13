import { Router } from "express";
import { requireAdmin } from "../middlewares/requireAuth";
import { authorizeScheduledCall, recordScheduledJob } from "../lib/scheduledJobs";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  browseWikiDriveFolders,
  getWikiDriveSyncStatus,
  normalizeDriveFolderId,
  runWikiDriveSync,
  WIKI_DRIVE_SOURCE_SETTING,
} from "../lib/wikiDriveSync";

const router = Router();
// requireAdmin is applied per-route (not via router.use()) so that
// /run-scheduled below -- called by the Worker's Cron Trigger, with no
// admin session at all -- can be reached and guarded by its own shared
// secret instead. Every other route here keeps the same admin requirement
// it always had.

router.get("/", requireAdmin, async (_req, res) => {
  res.json(await getWikiDriveSyncStatus());
});

router.patch("/", requireAdmin, async (req, res) => {
  const sourceFolderId = normalizeDriveFolderId(String(req.body?.sourceFolder ?? req.body?.sourceFolderId ?? ""));
  if (!sourceFolderId) {
    res.status(400).json({ error: "Enter a valid Google Drive folder ID or folder URL" });
    return;
  }
  const existing = await db.select({ id: settingsTable.id }).from(settingsTable).where(eq(settingsTable.key, WIKI_DRIVE_SOURCE_SETTING)).limit(1);
  if (existing[0]) await db.update(settingsTable).set({ value: sourceFolderId }).where(eq(settingsTable.id, existing[0].id));
  else await db.insert(settingsTable).values({ key: WIKI_DRIVE_SOURCE_SETTING, value: sourceFolderId });
  res.json(await getWikiDriveSyncStatus());
});

router.get("/folders", requireAdmin, async (req, res) => {
  const rawParentId = String(req.query.parentId ?? "").trim();
  const parentId: string | undefined = rawParentId ? (normalizeDriveFolderId(rawParentId, true) ?? undefined) : undefined;
  if (rawParentId && !parentId) {
    res.status(400).json({ error: "parentId must be a valid Google Drive folder ID" });
    return;
  }
  try {
    res.json({ folders: await browseWikiDriveFolders(parentId), parentId: parentId ?? null });
  } catch (error) {
    req.log.error({ error }, "Drive folder browse failed");
    res.status(502).json({ error: "Google Drive folder browse failed" });
  }
});

router.post("/run", requireAdmin, async (req, res) => {
  try {
    const status = await getWikiDriveSyncStatus();
    if (status.status.state === "running") {
      res.status(409).json({ error: "Wiki Drive sync is already running" });
      return;
    }
    void runWikiDriveSync(req.body?.full === true).catch((error) => req.log.error({ error }, "Manual Wiki Drive sync failed"));
    res.status(202).json({ accepted: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to start sync" });
  }
});

// ── POST /api/admin/wiki-drive-sync/run-scheduled ───────────────────────────
// Internal endpoint called by the Worker's scheduled() Cron Trigger handler
// (see src/worker.ts), not reachable by normal users -- this Container has no
// ingress of its own, so every request (public or Cron-triggered) passes
// through the same Worker fetch()/scheduled() path. The shared secret below
// is what distinguishes a legitimate scheduled call from an arbitrary public
// request to this same route; it must be set as WIKI_DRIVE_SYNC_RUN_SECRET in
// both the container's env and the Worker's envVars passed to it. Mirrors
// routes/weeklyPulse.ts's identical /run-scheduled pattern.
//
// This is the "guaranteed daily execution" path that used to be a Replit
// Scheduled Deployment invoking the standalone sync:wiki-drive script (see
// wikiDriveSyncJob.ts and .agents/memory/drive-wiki-sync.md) -- that no
// longer exists now that this app runs as a Cloudflare Worker + Container,
// so a Cron Trigger calling this route is its replacement.
// startWikiDriveScheduler() (lib/wikiDriveSync.ts, started from index.ts)
// remains as the hourly "catch-up if due" fallback it always was, for the
// same reason noted there: a scale-to-zero Container can't guarantee it's
// awake at any particular moment.
router.post("/run-scheduled", async (req, res) => {
  if (!(await authorizeScheduledCall(req, res, "wiki_drive_sync"))) return;
  await recordScheduledJob("wiki_drive_sync", "running");
  try {
    const stats = await runWikiDriveSync();
    await recordScheduledJob("wiki_drive_sync", "ok");
    res.json({ ok: true, stats });
  } catch (error) {
    await recordScheduledJob("wiki_drive_sync", "error", error instanceof Error ? error.message : "Sync failed");
    req.log.error({ error }, "Scheduled Wiki Drive sync failed");
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Sync failed" });
  }
});

export default router;