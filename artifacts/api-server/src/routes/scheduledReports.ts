// Scheduled reports (2026-10-14, Andrew): a saved report (template + events +
// recipients) that prepares and emails itself at 8 AM Eastern -- weekly on
// Mondays, monthly on the 1st, or quarterly on Jan/Apr/Jul/Oct 1 -- always
// covering the whole period that just ended (lib/reportPeriods.ts).
//
// Schedules are stored as one JSON list in the settings table (key
// "scheduled_reports"), so no migration was needed. Each run prepares the
// report exactly like the Reporting page (prepareReportRun in
// routes/reports.ts, using the schedule owner's Planning Center connection)
// and emails it like "Email PDF" (emailReportPdf). The Worker's scheduler
// calls POST /run-scheduled daily at 8:00 AM Eastern (lib/jobSchedule.ts,
// daylight saving included).
import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { db, reportTemplatesTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { authorizeScheduledCall, recordScheduledJob } from "../lib/scheduledJobs";
import { churchToday, CHURCH_TIME_ZONE, previousPeriod, type ReportPeriod } from "../lib/reportPeriods";
import {
  dueSchedules,
  MAX_SCHEDULES,
  nextRunDate,
  parseScheduleInput,
  SCHEDULE_HOUR_EASTERN,
  type ReportSchedule,
  type ScheduleRunRecord,
} from "../lib/reportSchedules";
import { emailReportPdf, parseReportRecipients, prepareReportRun } from "./reports";

const router: IRouter = Router();
const SETTINGS_KEY = "scheduled_reports";

function sendError(req: Request, res: Response, error: unknown, fallback: string) {
  const typed = error as Error & { status?: number };
  req.log.error({ err: error }, fallback);
  res.status(typed.status ?? 500).json({ error: typed.message || fallback });
}

export async function readSchedules(): Promise<ReportSchedule[]> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, SETTINGS_KEY)).limit(1);
  try {
    const parsed = rows[0] ? JSON.parse(rows[0].value) : [];
    return Array.isArray(parsed) ? parsed as ReportSchedule[] : [];
  } catch {
    return [];
  }
}

async function writeSchedules(schedules: ReportSchedule[]): Promise<void> {
  const value = JSON.stringify(schedules);
  await db.insert(settingsTable).values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

// Updates one schedule's lastRun in the stored list (re-read first so a
// concurrent edit in the admin UI isn't overwritten).
async function saveRun(id: string, run: ScheduleRunRecord): Promise<void> {
  const schedules = await readSchedules();
  const index = schedules.findIndex((schedule) => schedule.id === id);
  if (index < 0) return;
  schedules[index] = { ...schedules[index], lastRun: run };
  await writeSchedules(schedules);
}

function easternHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: CHURCH_TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(now));
}

const FREQUENCY_TEXT = { week: "weekly", month: "monthly", quarter: "quarterly" } as const;

// Prepares and emails one schedule's report for `period`. Never throws:
// failures are recorded on the schedule and returned.
export async function runSchedule(
  schedule: ReportSchedule,
  period: ReportPeriod,
  trigger: ScheduleRunRecord["trigger"],
): Promise<ScheduleRunRecord> {
  const base = { at: new Date().toISOString(), trigger, periodStart: period.startDate, periodEnd: period.endDate, periodLabel: period.label };
  await saveRun(schedule.id, { ...base, status: "running" });
  let record: ScheduleRunRecord;
  try {
    const prepared = await prepareReportRun(
      { eventIds: schedule.eventIds, templateId: schedule.templateId, startDate: period.startDate, endDate: period.endDate, period: "range" },
      schedule.ownerUserId,
      logger,
    );
    const result = await emailReportPdf(
      prepared.runId,
      schedule.templateId,
      schedule.ownerUserId,
      schedule.recipients,
      `Sent automatically by the ${FREQUENCY_TEXT[schedule.frequency]} scheduled report "${schedule.name}" (set up by ${schedule.ownerName}).`,
    );
    record = result.sent
      ? { ...base, status: "sent", peopleCount: prepared.peopleCount, sessionCount: prepared.sessionCount }
      : { ...base, status: "error", error: result.error ?? "The email could not be sent." };
  } catch (error) {
    record = { ...base, status: "error", error: error instanceof Error ? error.message : String(error) };
  }
  logger.info({ scheduleId: schedule.id, trigger, status: record.status, period: period.label, recipients: schedule.recipients.length }, "Scheduled report run");
  await saveRun(schedule.id, record);
  return record;
}

let runningScheduled = false;

// Runs every schedule due today, one at a time.
export async function runDueSchedules(now: Date = new Date()) {
  const today = churchToday(now);
  const due = dueSchedules(await readSchedules(), today);
  const results: { id: string; name: string; status: ScheduleRunRecord["status"]; error?: string }[] = [];
  for (const { schedule, period } of due) {
    const record = await runSchedule(schedule, period, "scheduled");
    results.push({ id: schedule.id, name: schedule.name, status: record.status, error: record.error });
  }
  return { today, results };
}

function withNextRun(schedule: ReportSchedule, now: Date) {
  const today = churchToday(now);
  const beforeRunHour = easternHour(now) < SCHEDULE_HOUR_EASTERN;
  return {
    ...schedule,
    nextRunDate: schedule.enabled ? nextRunDate(schedule.frequency, today, beforeRunHour) : null,
    nextPeriod: previousPeriod(schedule.frequency, schedule.enabled ? nextRunDate(schedule.frequency, today, beforeRunHour) : today),
  };
}

function ownerName(res: Response): string {
  const user = res.locals.dbUser as { firstName?: string | null; lastName?: string | null; email?: string | null };
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "an admin";
}

// ── GET /api/scheduled-reports ──────────────────────────────────────────────
router.get("/", requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    res.json({ schedules: (await readSchedules()).map((schedule) => withNextRun(schedule, now)) });
  } catch (error) {
    sendError(req, res, error, "Failed to load scheduled reports");
  }
});

async function templateExists(templateId: number): Promise<boolean> {
  const rows = await db.select({ id: reportTemplatesTable.id }).from(reportTemplatesTable).where(eq(reportTemplatesTable.id, templateId)).limit(1);
  return rows.length > 0;
}

// ── POST /api/scheduled-reports ─────────────────────────────────────────────
router.post("/", requireAdmin, async (req, res) => {
  try {
    const parsed = parseScheduleInput(req.body, parseReportRecipients);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    if (!(await templateExists(parsed.value.templateId))) {
      res.status(400).json({ error: "That report template no longer exists." });
      return;
    }
    const schedules = await readSchedules();
    if (schedules.length >= MAX_SCHEDULES) {
      res.status(400).json({ error: `At most ${MAX_SCHEDULES} scheduled reports.` });
      return;
    }
    const schedule: ReportSchedule = {
      id: randomUUID(),
      ...parsed.value,
      ownerUserId: res.locals.dbUser.id,
      ownerName: ownerName(res),
      createdAt: new Date().toISOString(),
      lastRun: null,
    };
    await writeSchedules([...schedules, schedule]);
    req.log.info({ scheduleId: schedule.id, frequency: schedule.frequency, recipients: schedule.recipients.length }, "Scheduled report created");
    res.status(201).json(withNextRun(schedule, new Date()));
  } catch (error) {
    sendError(req, res, error, "Failed to save the scheduled report");
  }
});

// ── PUT /api/scheduled-reports/:id ──────────────────────────────────────────
// Saving makes the saving admin the owner (their Planning Center connection
// prepares it from then on).
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const parsed = parseScheduleInput(req.body, parseReportRecipients);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    if (!(await templateExists(parsed.value.templateId))) {
      res.status(400).json({ error: "That report template no longer exists." });
      return;
    }
    const schedules = await readSchedules();
    const index = schedules.findIndex((schedule) => schedule.id === req.params.id);
    if (index < 0) {
      res.status(404).json({ error: "Scheduled report not found." });
      return;
    }
    schedules[index] = { ...schedules[index], ...parsed.value, ownerUserId: res.locals.dbUser.id, ownerName: ownerName(res) };
    await writeSchedules(schedules);
    res.json(withNextRun(schedules[index], new Date()));
  } catch (error) {
    sendError(req, res, error, "Failed to save the scheduled report");
  }
});

// ── DELETE /api/scheduled-reports/:id ───────────────────────────────────────
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const schedules = await readSchedules();
    const remaining = schedules.filter((schedule) => schedule.id !== req.params.id);
    if (remaining.length === schedules.length) {
      res.status(404).json({ error: "Scheduled report not found." });
      return;
    }
    await writeSchedules(remaining);
    res.json({ deleted: true });
  } catch (error) {
    sendError(req, res, error, "Failed to delete the scheduled report");
  }
});

// ── POST /api/scheduled-reports/:id/run ─────────────────────────────────────
// "Run now": prepares and emails the report for the most recent complete
// period (previous week/month/quarter as of today), so a schedule can be
// tested any day. Waits for the result, like "Pull and prepare data".
router.post("/:id/run", requireAdmin, async (req, res) => {
  try {
    const schedule = (await readSchedules()).find((entry) => entry.id === req.params.id);
    if (!schedule) {
      res.status(404).json({ error: "Scheduled report not found." });
      return;
    }
    const period = previousPeriod(schedule.frequency, churchToday());
    const record = await runSchedule(schedule, period, "manual");
    if (record.status !== "sent") {
      res.status(502).json({ error: record.error ?? "The report could not be sent.", run: record });
      return;
    }
    res.json({ run: record });
  } catch (error) {
    sendError(req, res, error, "Failed to run the scheduled report");
  }
});

// ── POST /api/scheduled-reports/run-scheduled ───────────────────────────────
// Worker scheduler, daily at 8:00 AM Eastern (WEEKLY_PULSE_RUN_SECRET).
router.post("/run-scheduled", async (req, res) => {
  if (!(await authorizeScheduledCall(req, res, "scheduled_reports"))) return;
  const now = new Date();
  // Safety net: the Worker only calls at 8 AM Eastern, but an older Worker
  // (or a stray call) at another hour is ignored without recording anything,
  // so it never overwrites the real run's result on the Scheduled jobs card.
  if (easternHour(now) !== SCHEDULE_HOUR_EASTERN) {
    res.json({ skipped: true, reason: "not 8 AM Eastern" });
    return;
  }
  if (runningScheduled) {
    await recordScheduledJob("scheduled_reports", "skipped", "Scheduled reports were already running.");
    res.json({ skipped: true });
    return;
  }
  runningScheduled = true;
  try {
    await recordScheduledJob("scheduled_reports", "running");
    const { today, results } = await runDueSchedules(now);
    const failed = results.filter((result) => result.status !== "sent");
    await recordScheduledJob(
      "scheduled_reports",
      !results.length ? "ok" : failed.length === 0 ? "ok" : failed.length < results.length ? "partial" : "error",
      !results.length
        ? `No reports were due on ${today}.`
        : `${results.length - failed.length} of ${results.length} sent${failed.length ? `. Failed: ${failed.map((result) => `${result.name} (${result.error ?? "error"})`).join("; ")}` : "."}`,
    );
    res.json({ today, results });
  } catch (error) {
    await recordScheduledJob("scheduled_reports", "error", error instanceof Error ? error.message : String(error));
    sendError(req, res, error, "Scheduled reports failed");
  } finally {
    runningScheduled = false;
  }
});

export default router;
