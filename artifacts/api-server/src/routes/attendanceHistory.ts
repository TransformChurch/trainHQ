// "Attendance history" -- a one-time (safely re-runnable) pull of Check-Ins
// attendance for every event, archived or active, binned by week, so the
// Weekly Pulse tracker has prior years to compare against.
//
// Read-only against Planning Center: every call below is a GET. Results are
// written only to our own checkins_weekly_history table.
//
// The admin page drives the pull in small steps (list events -> list one
// event's weeks -> pull a few weeks at a time) instead of one long request,
// so no single request runs long enough to time out, Planning Center's rate
// limit is respected (planningCenterRequest backs off on 429), and a stopped
// or failed pull can simply be re-run: rows are upserted per event + week.
//
// Like Group attendance history, a manual pull only visits events that
// existed in the chosen timeframe and (by default) only weeks not saved yet,
// and an optional weekly auto-sync (Worker Cron Trigger, Monday ~4am
// Eastern) slowly re-pulls the last few weeks and fills recent gaps.
//
// Weeks use the Weekly Pulse's Monday-00:00-UTC boundaries (see
// computeWeekRange in weeklyPulse.ts) so history lines up with the tracker.
// Counting matches fetchCheckInsWeeklyCount there: attendee check-ins only
// (no volunteers), unique people across all of the week's sessions.
import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { checkinsWeeklyHistoryTable, db, settingsTable } from "@workspace/db";
import {
  addDays,
  genderByPersonFromIncluded,
  readWeekOverrides,
  saveHistoryRows,
  summarizeCheckIns,
  trackerRowsFor,
  weekStartFor,
  writeWeekOverrides,
} from "../lib/checkinsHistory";
import { and, asc, count, countDistinct, eq, gte, lt, max, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { getValidPlanningCenterAccessToken } from "../lib/planningCenter";
import { groupActiveInRange } from "./groupHistory";
import {
  CHECK_INS_BASE,
  type JsonApiResource,
  fetchCollection,
  firstValue,
  planningCenterRequest,
  text,
} from "./reports";

export { addDays, summarizeCheckIns, weekStartFor };

const router: IRouter = Router();

// Per-request caps for POST /events/:eventId/weeks, keeping each call short.
export const MAX_WEEKS_PER_REQUEST = 8;
export const MAX_PERIODS_PER_REQUEST = 60;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const PCO_ID = /^\d{1,20}$/;

function sendError(req: Request, res: Response, error: unknown, fallback: string) {
  const typed = error as Error & { status?: number; details?: string };
  req.log.error({ err: error, details: typed.details }, fallback);
  res.status(typed.status ?? 500).json({ error: typed.message || fallback });
}

function errorMessage(error: unknown, fallback: string): string {
  const typed = error as Error & { status?: number };
  if (typed.status === 403) return "Planning Center refused access (403).";
  return typed.message || fallback;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type HistoryWeek = { weekStart: string; weekEnd: string; periodIds: string[] };

// Groups an event's sessions into Monday-start weeks, oldest first. Sessions
// before `since`, or not yet started as of `now`, are left out.
export function groupPeriodsByWeek(
  periods: { id: string; startsAt: string }[],
  since: string,
  now: Date = new Date(),
): HistoryWeek[] {
  const sinceMs = new Date(`${since}T00:00:00Z`).getTime();
  const byWeek = new Map<string, string[]>();
  for (const period of periods) {
    const startsMs = new Date(period.startsAt).getTime();
    if (!Number.isFinite(startsMs) || startsMs < sinceMs || startsMs > now.getTime()) continue;
    const weekStart = weekStartFor(period.startsAt);
    const ids = byWeek.get(weekStart) ?? [];
    ids.push(period.id);
    byWeek.set(weekStart, ids);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, periodIds]) => ({ weekStart, weekEnd: addDays(weekStart, 7), periodIds }));
}

// Excel/Sheets formula guard, same as weeklyPulse.ts's csvCell.
function csvCell(value: unknown): string {
  let raw = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(raw)) raw = `'${raw}`;
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function buildHistoryCsv(rows: {
  eventName: string;
  eventId: string;
  eventArchived: boolean;
  weekStart: string;
  weekEnd: string;
  uniqueAttendees: number;
  totalCheckIns: number;
  sessions: number;
}[]): string {
  const header = ["Event", "Event ID", "Archived", "Week start (Mon)", "Week end", "Unique attendees", "Total check-ins", "Sessions"];
  const lines = rows.map((row) => [
    row.eventName,
    row.eventId,
    row.eventArchived ? "Yes" : "No",
    row.weekStart,
    row.weekEnd,
    row.uniqueAttendees,
    row.totalCheckIns,
    row.sessions,
  ]);
  return [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export type CheckInsEvent = { id: string; name: string; archived: boolean; createdAt: string | null; archivedAt: string | null };

// Every Check-Ins event, active and archived, sorted by name.
export async function listCheckInsEvents(accessToken: string): Promise<CheckInsEvent[]> {
  const [active, archived] = await Promise.all([
    fetchCollection(`${CHECK_INS_BASE}/events?filter=not_archived&order=name&per_page=100`, accessToken),
    fetchCollection(`${CHECK_INS_BASE}/events?filter=archived&order=name&per_page=100`, accessToken),
  ]);
  const seen = new Set<string>();
  const events: CheckInsEvent[] = [];
  for (const [collection, isArchived] of [[active, false], [archived, true]] as const) {
    for (const event of collection.data) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      const archivedAt = text(event.attributes?.archived_at) || null;
      events.push({
        id: event.id,
        name: firstValue(event.attributes ?? {}, "name") || `Event ${event.id}`,
        archived: isArchived || !!archivedAt,
        createdAt: text(event.attributes?.created_at) || null,
        archivedAt,
      });
    }
  }
  return events.sort((a, b) => a.name.localeCompare(b.name));
}

// An event's sessions (event periods) starting on/after `since`.
async function listEventPeriods(accessToken: string, eventId: string, since: string, delayMs = 0) {
  const sinceIso = `${since}T00:00:00Z`;
  const periods: { id: string; startsAt: string }[] = [];
  let url: string | null =
    `${CHECK_INS_BASE}/events/${encodeURIComponent(eventId)}/event_periods?order=-starts_at&per_page=100`;
  const visited = new Set<string>();
  while (url && !visited.has(url)) {
    visited.add(url);
    if (delayMs && visited.size > 1) await sleep(delayMs);
    const page = await planningCenterRequest(url, accessToken);
    const rows: JsonApiResource[] = Array.isArray(page.data) ? page.data : [];
    let reachedOlder = false;
    for (const row of rows) {
      const startsAt = text(row.attributes?.starts_at);
      if (!startsAt) continue;
      if (startsAt < sinceIso) { reachedOlder = true; continue; }
      periods.push({ id: row.id, startsAt });
    }
    // Newest first, so once a session is older than `since` the rest are too.
    if (reachedOlder || periods.length > 20_000) break;
    url = typeof page.links?.next === "string" && page.links.next ? page.links.next : null;
  }
  return periods;
}

// Attendee check-ins for the given weeks' sessions -> one tracker row per week.
async function pullEventWeeks(
  accessToken: string,
  eventId: string,
  weeks: { weekStart: string; periodIds: string[] }[],
  delayMs = 0,
) {
  const rows = [];
  for (const week of weeks) {
    const checkIns: JsonApiResource[] = [];
    const included: JsonApiResource[] = [];
    for (const periodId of week.periodIds) {
      if (delayMs) await sleep(delayMs);
      const collection = await fetchCollection(
        `${CHECK_INS_BASE}/events/${encodeURIComponent(eventId)}/event_periods/${encodeURIComponent(periodId)}/check_ins?filter=attendee&include=person&per_page=100`,
        accessToken,
      );
      checkIns.push(...collection.data);
      included.push(...collection.included);
    }
    rows.push({
      weekStart: week.weekStart,
      weekEnd: addDays(week.weekStart, 7),
      sessions: week.periodIds.length,
      ...summarizeCheckIns(checkIns, genderByPersonFromIncluded(included)),
      firstTimers: null,
      firstTimersReturned: null,
    });
  }
  return rows;
}

// eventId -> week starts already saved in [since, until).
export async function savedEventWeeks(since: string, until: string): Promise<Map<string, Set<string>>> {
  const rows = await db.select({ eventId: checkinsWeeklyHistoryTable.eventId, weekStart: checkinsWeeklyHistoryTable.weekStart })
    .from(checkinsWeeklyHistoryTable)
    .where(and(gte(checkinsWeeklyHistoryTable.weekStart, since), lt(checkinsWeeklyHistoryTable.weekStart, until)));
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = map.get(row.eventId) ?? new Set<string>();
    set.add(row.weekStart);
    map.set(row.eventId, set);
  }
  return map;
}

// ── Weekly auto-sync ────────────────────────────────────────────────────────
// Same approach as the group auto-sync (routes/groupHistory.ts): settings in
// the settings key/value table; each run re-pulls the last REFRESH_WEEKS weeks
// (late check-in edits) and fills any missing week in the last
// GAP_WINDOW_WEEKS, pausing between Planning Center calls. It never touches
// the first-timer columns a report prepare saved (saveHistoryRows keeps them).
const AUTO_SYNC_KEY = "checkins_history_auto_sync";
export const CHECKINS_AUTO_SYNC_REFRESH_WEEKS = 3;
export const CHECKINS_AUTO_SYNC_GAP_WINDOW_WEEKS = 12;
const AUTO_SYNC_DELAY_MS = 800;

type AutoSyncRun = {
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "success" | "partial" | "error";
  eventsChecked: number;
  weeksSaved: number;
  failures: { event: string; error: string }[];
  message?: string;
};
type AutoSyncSettings = { enabled: boolean; userId: string | null; lastRun: AutoSyncRun | null };

export async function readCheckinsAutoSync(): Promise<AutoSyncSettings> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, AUTO_SYNC_KEY)).limit(1);
  try {
    const parsed = rows[0] ? JSON.parse(rows[0].value) : {};
    return { enabled: parsed.enabled === true, userId: parsed.userId ?? null, lastRun: parsed.lastRun ?? null };
  } catch {
    return { enabled: false, userId: null, lastRun: null };
  }
}

async function writeCheckinsAutoSync(settings: AutoSyncSettings): Promise<void> {
  const value = JSON.stringify(settings);
  await db.insert(settingsTable).values({ key: AUTO_SYNC_KEY, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

// Weeks the auto-sync pulls for one event: every recent week, plus any older
// week in the gap window that has sessions but no saved row.
export function eventWeeksToSync(weeks: HistoryWeek[], saved: Set<string> | undefined, refreshFrom: string): HistoryWeek[] {
  return weeks.filter((week) => week.weekStart >= refreshFrom || !saved?.has(week.weekStart));
}

let autoSyncRunning = false;

export async function runCheckinsAutoSync(
  now: Date = new Date(),
  getToken: (userId: string) => Promise<string> = getValidPlanningCenterAccessToken,
  delayMs: number = AUTO_SYNC_DELAY_MS,
): Promise<AutoSyncRun> {
  const settings = await readCheckinsAutoSync();
  const startedAt = new Date().toISOString();
  if (!settings.enabled || !settings.userId) {
    return { startedAt, finishedAt: startedAt, status: "error", eventsChecked: 0, weeksSaved: 0, failures: [], message: "Automatic sync is turned off." };
  }
  if (autoSyncRunning) {
    return { startedAt, finishedAt: startedAt, status: "error", eventsChecked: 0, weeksSaved: 0, failures: [], message: "A sync is already running." };
  }
  autoSyncRunning = true;
  const run: AutoSyncRun = { startedAt, finishedAt: null, status: "running", eventsChecked: 0, weeksSaved: 0, failures: [] };
  try {
    await writeCheckinsAutoSync({ ...settings, lastRun: run });
    const thisWeek = weekStartFor(now.toISOString());
    const refreshFrom = addDays(thisWeek, -7 * CHECKINS_AUTO_SYNC_REFRESH_WEEKS);
    const gapFrom = addDays(thisWeek, -7 * CHECKINS_AUTO_SYNC_GAP_WINDOW_WEEKS);
    const until = addDays(thisWeek, 7);
    let accessToken = await getToken(settings.userId);
    const events = (await listCheckInsEvents(accessToken)).filter((event) => groupActiveInRange(event, gapFrom, until));
    const saved = await savedEventWeeks(gapFrom, until);
    let consecutiveFailures = 0;
    for (const event of events) {
      try {
        accessToken = await getToken(settings.userId);
        await sleep(delayMs);
        const weeks = eventWeeksToSync(
          groupPeriodsByWeek(await listEventPeriods(accessToken, event.id, gapFrom, delayMs), gapFrom, now),
          saved.get(event.id),
          refreshFrom,
        );
        if (weeks.length) {
          const rows = await pullEventWeeks(accessToken, event.id, weeks, delayMs);
          await saveHistoryRows({ eventId: event.id, eventName: event.name, archived: event.archived }, rows);
          run.weeksSaved += rows.length;
        }
        consecutiveFailures = 0;
      } catch (error) {
        run.failures.push({ event: event.name, error: errorMessage(error, "Request failed") });
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) await sleep(delayMs ? 60_000 : 0);
      } finally {
        run.eventsChecked += 1;
      }
    }
    run.status = run.failures.length ? (run.failures.length === events.length && events.length ? "error" : "partial") : "success";
  } catch (error) {
    run.status = "error";
    run.message = errorMessage(error, "Automatic sync failed");
  } finally {
    run.finishedAt = new Date().toISOString();
    autoSyncRunning = false;
    const latest = await readCheckinsAutoSync().catch(() => settings);
    await writeCheckinsAutoSync({ ...latest, lastRun: run }).catch((error) => logger.error({ err: error }, "Could not save attendance auto-sync result"));
  }
  return run;
}

function secretsMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

// ── GET /api/attendance-history/events ──────────────────────────────────────
// Every Check-Ins event, active and archived (with created/archived dates so
// the page can skip events that didn't exist in a timeframe).
router.get("/events", requireAdmin, async (req, res) => {
  try {
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    res.json(await listCheckInsEvents(accessToken));
  } catch (error) {
    sendError(req, res, error, "Failed to load Check-Ins events");
  }
});

// ── GET /api/attendance-history/saved-weeks?since=&until= ───────────────────
// { [eventId]: weekStart[] } already saved -- lets a manual pull skip them.
router.get("/saved-weeks", requireAdmin, async (req, res) => {
  try {
    const since = text(req.query.since);
    const until = text(req.query.until);
    if (!DATE_ONLY.test(since) || !DATE_ONLY.test(until)) {
      res.status(400).json({ error: "since and until (YYYY-MM-DD) are required." });
      return;
    }
    const saved = await savedEventWeeks(since, until);
    res.json(Object.fromEntries([...saved].map(([eventId, weeks]) => [eventId, [...weeks].sort()])));
  } catch (error) {
    sendError(req, res, error, "Failed to load saved weeks");
  }
});

// ── GET/POST /api/attendance-history/auto-sync ──────────────────────────────
router.get("/auto-sync", requireAdmin, async (req, res) => {
  try {
    const settings = await readCheckinsAutoSync();
    res.json({ enabled: settings.enabled, lastRun: settings.lastRun, usesYourConnection: settings.userId === res.locals.dbUser.id });
  } catch (error) {
    sendError(req, res, error, "Failed to load automatic sync settings");
  }
});

router.post("/auto-sync", requireAdmin, async (req, res) => {
  try {
    const current = await readCheckinsAutoSync();
    const enabled = req.body?.enabled === true;
    await writeCheckinsAutoSync({ ...current, enabled, userId: enabled ? res.locals.dbUser.id : current.userId });
    res.json({ enabled, lastRun: current.lastRun, usesYourConnection: enabled });
  } catch (error) {
    sendError(req, res, error, "Failed to save automatic sync settings");
  }
});

// ── POST /api/attendance-history/run-scheduled ──────────────────────────────
// Called by the Worker's weekly Cron Trigger (src/worker.ts), guarded by the
// Weekly Pulse's internal secret like the group auto-sync.
router.post("/run-scheduled", async (req, res) => {
  const expectedSecret = process.env.WEEKLY_PULSE_RUN_SECRET;
  const providedSecret = req.header("x-internal-secret") ?? "";
  if (!expectedSecret || !providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const run = await runCheckinsAutoSync();
  req.log.info({ run: { ...run, failures: run.failures.length } }, "Attendance history auto-sync finished");
  res.json(run);
});

// ── GET /api/attendance-history/events/:eventId/weeks?since=YYYY-MM-DD ──────
// The event's sessions since `since`, grouped into weeks.
router.get("/events/:eventId/weeks", requireAdmin, async (req, res) => {
  try {
    const eventId = text(req.params.eventId);
    const since = text(req.query.since);
    if (!PCO_ID.test(eventId) || !DATE_ONLY.test(since)) {
      res.status(400).json({ error: "Invalid event id or start date." });
      return;
    }
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    res.json(groupPeriodsByWeek(await listEventPeriods(accessToken, eventId, since), since));
  } catch (error) {
    sendError(req, res, error, "Failed to load this event's sessions");
  }
});

// ── POST /api/attendance-history/events/:eventId/weeks ──────────────────────
// Body: { eventName, archived, weeks: [{ weekStart, periodIds }] }. Pulls the
// attendee check-ins for those weeks' sessions and saves one row per week.
router.post("/events/:eventId/weeks", requireAdmin, async (req, res) => {
  try {
    const eventId = text(req.params.eventId);
    const eventName = text(req.body?.eventName).slice(0, 300) || `Event ${eventId}`;
    const archived = req.body?.archived === true;
    const rawWeeks: unknown[] = Array.isArray(req.body?.weeks) ? req.body.weeks : [];
    const weeks = rawWeeks
      .filter((week): week is Record<string, unknown> => typeof week === "object" && week !== null)
      .map((week) => ({
        weekStart: text(week.weekStart),
        periodIds: Array.isArray(week.periodIds) ? week.periodIds.map((id) => text(id)) : [],
      }));
    const totalPeriods = weeks.reduce((sum, week) => sum + week.periodIds.length, 0);
    const valid =
      PCO_ID.test(eventId) &&
      weeks.length > 0 &&
      weeks.length <= MAX_WEEKS_PER_REQUEST &&
      totalPeriods <= MAX_PERIODS_PER_REQUEST &&
      weeks.every((week) =>
        DATE_ONLY.test(week.weekStart) &&
        weekStartFor(`${week.weekStart}T12:00:00Z`) === week.weekStart &&
        week.periodIds.length > 0 &&
        week.periodIds.every((id) => PCO_ID.test(id)));
    if (!valid) {
      res.status(400).json({
        error: `Send 1-${MAX_WEEKS_PER_REQUEST} Monday-start weeks with at most ${MAX_PERIODS_PER_REQUEST} sessions in total.`,
      });
      return;
    }

    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    const rows = await pullEventWeeks(accessToken, eventId, weeks);
    await saveHistoryRows({ eventId, eventName, archived }, rows);
    const saved = rows.map((row) => ({
      weekStart: row.weekStart,
      uniqueAttendees: row.uniqueAttendees,
      totalCheckIns: row.totalCheckIns,
      sessions: row.sessions,
    }));
    res.json({ saved });
  } catch (error) {
    sendError(req, res, error, "Failed to pull attendance for these weeks");
  }
});

// ── Week substitutions: GET/POST/DELETE /api/attendance-history/overrides ───
// "For this event, the week of <date>, use that other event's numbers" -- see
// lib/checkinsHistory.ts. Adding one pulls the source event's sessions for
// that week from Planning Center (read-only) into the tracker first.
async function overridesWithNumbers() {
  const overrides = await readWeekOverrides();
  const rows = await trackerRowsFor(overrides.flatMap((o) => [
    { eventId: o.eventId, weekStart: o.weekStart },
    { eventId: o.sourceEventId, weekStart: o.weekStart },
  ]));
  const find = (eventId: string, weekStart: string) =>
    rows.find((row) => row.eventId === eventId && row.weekStart === weekStart)?.uniqueAttendees ?? null;
  return overrides
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .map((o) => ({ ...o, ownAttendees: find(o.eventId, o.weekStart), sourceAttendees: find(o.sourceEventId, o.weekStart) }));
}

router.get("/overrides", requireAdmin, async (req, res) => {
  try {
    res.json(await overridesWithNumbers());
  } catch (error) {
    sendError(req, res, error, "Failed to load week substitutions");
  }
});

router.post("/overrides", requireAdmin, async (req, res) => {
  try {
    const eventId = text(req.body?.eventId);
    const sourceEventId = text(req.body?.sourceEventId);
    const date = text(req.body?.date);
    if (!PCO_ID.test(eventId) || !PCO_ID.test(sourceEventId) || !DATE_ONLY.test(date) || eventId === sourceEventId) {
      res.status(400).json({ error: "Pick two different events and a date." });
      return;
    }
    const eventName = text(req.body?.eventName).slice(0, 300) || `Event ${eventId}`;
    const sourceEventName = text(req.body?.sourceEventName).slice(0, 300) || `Event ${sourceEventId}`;
    const weekStart = weekStartFor(`${date}T12:00:00Z`);
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    const sessions = (await listEventPeriods(accessToken, sourceEventId, weekStart))
      .filter((period) => weekStartFor(period.startsAt) === weekStart);
    if (!sessions.length) {
      res.status(404).json({ error: `${sourceEventName} has no sessions in the week of ${weekStart}.` });
      return;
    }
    const rows = await pullEventWeeks(accessToken, sourceEventId, [{ weekStart, periodIds: sessions.map((p) => p.id) }]);
    await saveHistoryRows({ eventId: sourceEventId, eventName: sourceEventName, archived: req.body?.sourceArchived === true }, rows);
    const overrides = (await readWeekOverrides()).filter((o) => !(o.eventId === eventId && o.weekStart === weekStart));
    overrides.push({ eventId, eventName, weekStart, sourceEventId, sourceEventName, createdAt: new Date().toISOString() });
    await writeWeekOverrides(overrides);
    res.json(await overridesWithNumbers());
  } catch (error) {
    sendError(req, res, error, "Failed to save the week substitution");
  }
});

router.delete("/overrides", requireAdmin, async (req, res) => {
  try {
    const eventId = text(req.query.eventId);
    const weekStart = text(req.query.weekStart);
    await writeWeekOverrides((await readWeekOverrides()).filter((o) => !(o.eventId === eventId && o.weekStart === weekStart)));
    res.json(await overridesWithNumbers());
  } catch (error) {
    sendError(req, res, error, "Failed to remove the week substitution");
  }
});

// ── GET /api/attendance-history/summary ─────────────────────────────────────
router.get("/summary", requireAdmin, async (req, res) => {
  try {
    const [row] = await db.select({
      rows: count(),
      events: countDistinct(checkinsWeeklyHistoryTable.eventId),
      firstWeek: sql<string | null>`min(${checkinsWeeklyHistoryTable.weekStart})`,
      lastWeek: sql<string | null>`max(${checkinsWeeklyHistoryTable.weekStart})`,
      lastFetchedAt: max(checkinsWeeklyHistoryTable.fetchedAt),
    }).from(checkinsWeeklyHistoryTable);
    res.json(row);
  } catch (error) {
    sendError(req, res, error, "Failed to load attendance history summary");
  }
});

// ── GET /api/attendance-history/history.csv ─────────────────────────────────
router.get("/history.csv", requireAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(checkinsWeeklyHistoryTable)
      .orderBy(asc(checkinsWeeklyHistoryTable.eventName), asc(checkinsWeeklyHistoryTable.weekStart));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="attendance-history-by-week.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.send("﻿" + buildHistoryCsv(rows));
  } catch (error) {
    sendError(req, res, error, "Failed to download attendance history");
  }
});

export default router;
