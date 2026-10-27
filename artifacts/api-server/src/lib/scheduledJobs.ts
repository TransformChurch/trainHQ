// Health tracking for the Worker's Cron Trigger jobs (src/worker.ts
// scheduled()). Added 2026-10-13 after the Monday 10/12 jobs failed
// silently: WEEKLY_PULSE_RUN_SECRET wasn't set, every /run-scheduled call was
// turned away with a 401, and nothing in the database or the admin UI showed
// it -- the only trace was a console.error in the Worker's logs.
//
// Each /run-scheduled route now records what happened (started, finished
// ok/with problems/failed, or rejected because the secret didn't check out)
// under one settings row per job, and GET /api/weekly-pulse/scheduled-jobs
// turns that into a health list for the Reporting page. A job whose most
// recent expected firing time passed with no record at all is reported as
// "missed" -- that also covers the cases this container can't see, like the
// cron never firing or the Worker failing before it reaches us.
import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { db, settingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { logger } from "./logger";
import {
  DEFAULT_PULSE_SEND_TIMES,
  describeSendTime,
  easternParts,
  FIXED_JOB_TIMES,
  formatEasternTime,
  lastEasternOccurrence,
  WEEKDAY_NAMES,
  type EasternTime,
  type PulseSendTime,
} from "./jobSchedule";
import { activePulseSendTimes } from "./pulseSchedule";

export type ScheduledJobId = "weekly_pulse" | "group_history_sync" | "checkins_history_sync" | "wiki_drive_sync" | "people_sync" | "engagement_dashboard" | "scheduled_reports";

// When each job runs is defined once, in US Eastern time, in
// lib/jobSchedule.ts (shared with the Worker); the Weekly Pulse's times are
// the admin-chosen send times (lib/pulseSchedule.ts). 2026-10-18.
type ScheduledJobDefinition = {
  id: ScheduledJobId;
  label: string;
  secretEnv: "WEEKLY_PULSE_RUN_SECRET" | "WIKI_DRIVE_SYNC_RUN_SECRET";
  // How long after the firing time a missing record counts as "missed".
  graceMinutes: number;
};

export const SCHEDULED_JOBS: ScheduledJobDefinition[] = [
  { id: "scheduled_reports", label: "Scheduled reports", secretEnv: "WEEKLY_PULSE_RUN_SECRET", graceMinutes: 60 },
  { id: "people_sync", label: "Planning Center people sync", secretEnv: "WEEKLY_PULSE_RUN_SECRET", graceMinutes: 60 },
  { id: "group_history_sync", label: "Group attendance auto-sync", secretEnv: "WEEKLY_PULSE_RUN_SECRET", graceMinutes: 30 },
  { id: "checkins_history_sync", label: "Check-ins attendance auto-sync", secretEnv: "WEEKLY_PULSE_RUN_SECRET", graceMinutes: 30 },
  { id: "engagement_dashboard", label: "Engagement dashboard sync + email", secretEnv: "WEEKLY_PULSE_RUN_SECRET", graceMinutes: 30 },
  { id: "weekly_pulse", label: "Weekly Pulse email", secretEnv: "WEEKLY_PULSE_RUN_SECRET", graceMinutes: 30 },
  { id: "wiki_drive_sync", label: "Wiki Drive sync", secretEnv: "WIKI_DRIVE_SYNC_RUN_SECRET", graceMinutes: 30 },
];

export type ScheduledJobResult = "running" | "ok" | "partial" | "skipped" | "error" | "rejected";

export type ScheduledJobRecord = {
  lastAttemptAt: string;
  result: ScheduledJobResult;
  detail: string | null;
  finishedAt: string | null;
  lastOkAt: string | null;
};

export type ScheduledJobHealth = {
  id: ScheduledJobId;
  label: string;
  schedule: string;
  lastExpectedAt: string;
  status: "ok" | "running" | "warning" | "failed" | "missed" | "never";
  message: string;
  record: ScheduledJobRecord | null;
};

const keyFor = (id: ScheduledJobId) => `scheduled_job_status:${id}`;

function definition(id: ScheduledJobId): ScheduledJobDefinition {
  const job = SCHEDULED_JOBS.find((entry) => entry.id === id);
  if (!job) throw new Error(`Unknown scheduled job ${id}`);
  return job;
}

function secretsMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

async function readRecords(ids: ScheduledJobId[]): Promise<Map<ScheduledJobId, ScheduledJobRecord>> {
  const rows = await db.select().from(settingsTable).where(inArray(settingsTable.key, ids.map(keyFor)));
  const records = new Map<ScheduledJobId, ScheduledJobRecord>();
  for (const id of ids) {
    const row = rows.find((entry) => entry.key === keyFor(id));
    if (!row) continue;
    try {
      const parsed = JSON.parse(row.value) as Partial<ScheduledJobRecord>;
      if (typeof parsed.lastAttemptAt === "string" && typeof parsed.result === "string") {
        records.set(id, {
          lastAttemptAt: parsed.lastAttemptAt,
          result: parsed.result as ScheduledJobResult,
          detail: typeof parsed.detail === "string" ? parsed.detail : null,
          finishedAt: typeof parsed.finishedAt === "string" ? parsed.finishedAt : null,
          lastOkAt: typeof parsed.lastOkAt === "string" ? parsed.lastOkAt : null,
        });
      }
    } catch {
      // Unreadable row: treat as no record.
    }
  }
  return records;
}

// Best-effort: a failure to record must never break the job itself.
export async function recordScheduledJob(
  id: ScheduledJobId,
  result: ScheduledJobResult,
  detail: string | null = null,
  now: Date = new Date(),
): Promise<void> {
  try {
    const previous = (await readRecords([id])).get(id) ?? null;
    const stamp = now.toISOString();
    const record: ScheduledJobRecord = {
      // "running" opens an attempt; later results close the same attempt.
      lastAttemptAt: result === "running" || !previous || previous.result !== "running" ? stamp : previous.lastAttemptAt,
      result,
      detail: detail ? detail.slice(0, 500) : null,
      finishedAt: result === "running" ? null : stamp,
      lastOkAt: result === "ok" ? stamp : previous?.lastOkAt ?? null,
    };
    const value = JSON.stringify(record);
    await db.insert(settingsTable).values({ key: keyFor(id), value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
  } catch (error) {
    logger.error({ err: error, job: id }, "Failed to record scheduled job status");
  }
}

// Calls made by the Worker's scheduled() handler are addressed to
// https://internal/..., so only those carry Host "internal". Public requests
// arrive with the real hostname. Rejections are only recorded for internal
// calls, so someone poking the public URL can't fake a "rejected" alert.
function isInternalSchedulerCall(req: Request): boolean {
  return (req.header("host") ?? "").split(":")[0] === "internal";
}

// Replaces each route's inline secret check. Sends the 401 itself and
// returns false when the call isn't authorized.
export async function authorizeScheduledCall(req: Request, res: Response, id: ScheduledJobId): Promise<boolean> {
  const job = definition(id);
  const expectedSecret = process.env[job.secretEnv];
  const providedSecret = req.header("x-internal-secret") ?? "";
  if (expectedSecret && providedSecret && secretsMatch(providedSecret, expectedSecret)) return true;
  if (isInternalSchedulerCall(req)) {
    const reason = !expectedSecret
      ? `${job.secretEnv} isn't set on the API. Add it as a Secret on the transform-church-api Worker, then redeploy.`
      : !providedSecret
        ? `The scheduler sent no ${job.secretEnv}. Add it as a Secret on the transform-church-api Worker, then redeploy.`
        : `${job.secretEnv} didn't match. The API container may still have an old value -- redeploy the transform-church-api Worker.`;
    req.log?.error({ job: id }, `Scheduled job rejected: ${reason}`);
    await recordScheduledJob(id, "rejected", reason);
  }
  res.status(401).json({ error: "Unauthorized" });
  return false;
}

// A job's Eastern-time schedule. The Weekly Pulse's comes from its send
// times (pass them in; defaults to the original Monday 7:00 AM).
function jobTimes(id: ScheduledJobId, pulseTimes: PulseSendTime[]): EasternTime[] {
  if (id === "weekly_pulse") {
    return pulseTimes.map((time) => {
      const [hour, minute] = time.time.split(":").map(Number);
      return { weekday: time.weekday, hour, minute };
    });
  }
  const job = FIXED_JOB_TIMES[id];
  return [{ weekday: job.weekday, hour: job.hour, minute: job.minute }];
}

// The most recent time this job should have fired at or before `now`
// (null when it has no times, e.g. no Weekly Pulse is turned on).
export function lastExpectedFire(id: ScheduledJobId, now: Date = new Date(), pulseTimes: PulseSendTime[] = DEFAULT_PULSE_SEND_TIMES): Date | null {
  return lastEasternOccurrence(jobTimes(id, pulseTimes), now);
}

export function scheduleText(id: ScheduledJobId, pulseTimes: PulseSendTime[] = DEFAULT_PULSE_SEND_TIMES): string {
  if (id === "weekly_pulse") {
    return pulseTimes.length ? `${pulseTimes.map(describeSendTime).join(", ")} Eastern` : "No Weekly Pulse is turned on";
  }
  const job = FIXED_JOB_TIMES[id];
  const when = formatEasternTime(job.hour, job.minute);
  if (id === "scheduled_reports") return `Daily check at ${when} Eastern`;
  return job.weekday === null ? `Daily at ${when} Eastern` : `${WEEKDAY_NAMES[job.weekday]}s at ${when} Eastern`;
}

// Slack for clock differences between the Worker and the container.
const EARLY_TOLERANCE_MS = 5 * 60 * 1000;

export function assessScheduledJob(
  id: ScheduledJobId,
  record: ScheduledJobRecord | null,
  now: Date = new Date(),
  pulseTimes: PulseSendTime[] = DEFAULT_PULSE_SEND_TIMES,
): ScheduledJobHealth {
  const job = definition(id);
  const expectedOrNull = lastExpectedFire(id, now, pulseTimes);
  const schedule = scheduleText(id, pulseTimes);
  if (!expectedOrNull) {
    return { id, label: job.label, schedule, lastExpectedAt: "", record, status: "ok", message: "Nothing is scheduled." };
  }
  const expected = expectedOrNull;
  const base = { id, label: job.label, schedule, lastExpectedAt: expected.toISOString(), record };
  const pastGrace = now.getTime() > expected.getTime() + job.graceMinutes * 60 * 1000;
  const coversLatest = !!record && new Date(record.lastAttemptAt).getTime() >= expected.getTime() - EARLY_TOLERANCE_MS;

  if (!record) {
    return { ...base, status: "never", message: "No scheduled run has been recorded yet. The first one after this update will show here." };
  }
  if (!coversLatest) {
    return pastGrace
      ? { ...base, status: "missed", message: `No run was recorded for ${easternParts(expected).ymd}. The scheduler may not have fired, or the Worker failed before reaching the API -- check the Worker's logs in Cloudflare.` }
      : { ...base, status: "ok", message: "Waiting for this run's scheduled time." };
  }
  switch (record.result) {
    case "ok":
      return { ...base, status: "ok", message: record.detail || "Ran successfully." };
    case "running":
      // A run that never closed was most likely cut off (container restart).
      return now.getTime() - new Date(record.lastAttemptAt).getTime() > 6 * 60 * 60 * 1000
        ? { ...base, status: "failed", message: "Started but never finished -- it was probably interrupted." }
        : { ...base, status: "running", message: "Running now." };
    case "partial":
      return { ...base, status: "warning", message: record.detail || "Finished with some problems." };
    case "skipped":
      return { ...base, status: "ok", message: record.detail || "Skipped." };
    case "rejected":
      return { ...base, status: "failed", message: record.detail || "Rejected: the scheduler's secret didn't check out." };
    case "error":
    default:
      return { ...base, status: "failed", message: record.detail || "Failed." };
  }
}

export async function getScheduledJobsHealth(now: Date = new Date()): Promise<ScheduledJobHealth[]> {
  const ids = SCHEDULED_JOBS.map((job) => job.id);
  const records = await readRecords(ids);
  const pulseTimes = await activePulseSendTimes();
  return ids.map((id) => assessScheduledJob(id, records.get(id) ?? null, now, pulseTimes));
}

// Maps an attendance auto-sync run (group or check-ins) to a job result.
// "Turned off" and "already running" are deliberate no-ops, not failures.
export function autoSyncOutcome(
  run: { status: "running" | "success" | "partial" | "error"; failures: { error: string }[]; message?: string },
  summary: string,
): { result: ScheduledJobResult; detail: string } {
  if (run.status === "success") return { result: "ok", detail: summary };
  if (run.status === "partial") {
    return { result: "partial", detail: `${summary}; ${run.failures.length} failed${run.failures[0] ? ` (first: ${run.failures[0].error})` : ""}` };
  }
  if (run.message === "Automatic sync is turned off.") return { result: "skipped", detail: "Automatic sync is turned off in the Reporting page." };
  if (run.message === "A sync is already running.") return { result: "skipped", detail: "Skipped: a sync was already running." };
  return { result: "error", detail: run.message || run.failures[0]?.error || "Failed." };
}
