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
// Weeks use the Weekly Pulse's Monday-00:00-UTC boundaries (see
// computeWeekRange in weeklyPulse.ts) so history lines up with the tracker.
// Counting matches fetchCheckInsWeeklyCount there: attendee check-ins only
// (no volunteers), unique people across all of the week's sessions.
import { Router, type IRouter, type Request, type Response } from "express";
import { checkinsWeeklyHistoryTable, db } from "@workspace/db";
import { asc, count, countDistinct, max, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";
import { getValidPlanningCenterAccessToken } from "../lib/planningCenter";
import {
  CHECK_INS_BASE,
  type JsonApiResource,
  fetchCollection,
  firstValue,
  planningCenterRequest,
  relationshipId,
  text,
} from "./reports";

const router: IRouter = Router();

// Per-request caps for POST /events/:eventId/weeks, keeping each call short.
export const MAX_WEEKS_PER_REQUEST = 8;
export const MAX_PERIODS_PER_REQUEST = 60;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const PCO_ID = /^\d{1,20}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function sendError(req: Request, res: Response, error: unknown, fallback: string) {
  const typed = error as Error & { status?: number; details?: string };
  req.log.error({ err: error, details: typed.details }, fallback);
  res.status(typed.status ?? 500).json({ error: typed.message || fallback });
}

// Monday 00:00 UTC on or before the given instant, as YYYY-MM-DD.
export function weekStartFor(iso: string): string {
  const date = new Date(iso);
  date.setUTCHours(0, 0, 0, 0);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - daysSinceMonday * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(dateOnly: string, days: number): string {
  return new Date(new Date(`${dateOnly}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

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

// Unique people across a week's attendee check-ins. Falls back to the raw
// count if Planning Center ever omits the person link, same as the Pulse.
export function summarizeCheckIns(checkIns: JsonApiResource[]): { uniqueAttendees: number; totalCheckIns: number } {
  const people = new Set(checkIns.map((checkIn) => relationshipId(checkIn, "person")).filter(Boolean));
  return { uniqueAttendees: people.size || checkIns.length, totalCheckIns: checkIns.length };
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

// ── GET /api/attendance-history/events ──────────────────────────────────────
// Every Check-Ins event, active and archived.
router.get("/events", requireAdmin, async (req, res) => {
  try {
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    const [active, archived] = await Promise.all([
      fetchCollection(`${CHECK_INS_BASE}/events?filter=not_archived&order=name&per_page=100`, accessToken),
      fetchCollection(`${CHECK_INS_BASE}/events?filter=archived&order=name&per_page=100`, accessToken),
    ]);
    const seen = new Set<string>();
    const events: { id: string; name: string; archived: boolean }[] = [];
    for (const [collection, isArchived] of [[active, false], [archived, true]] as const) {
      for (const event of collection.data) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        events.push({
          id: event.id,
          name: firstValue(event.attributes ?? {}, "name") || `Event ${event.id}`,
          archived: isArchived || !!text(event.attributes?.archived_at),
        });
      }
    }
    events.sort((a, b) => a.name.localeCompare(b.name));
    res.json(events);
  } catch (error) {
    sendError(req, res, error, "Failed to load Check-Ins events");
  }
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
    const sinceIso = `${since}T00:00:00Z`;
    const periods: { id: string; startsAt: string }[] = [];
    let url: string | null =
      `${CHECK_INS_BASE}/events/${encodeURIComponent(eventId)}/event_periods?order=-starts_at&per_page=100`;
    const visited = new Set<string>();
    while (url && !visited.has(url)) {
      visited.add(url);
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
    res.json(groupPeriodsByWeek(periods, since));
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
    const saved = [];
    for (const week of weeks) {
      const checkIns: JsonApiResource[] = [];
      for (const periodId of week.periodIds) {
        const collection = await fetchCollection(
          `${CHECK_INS_BASE}/events/${encodeURIComponent(eventId)}/event_periods/${encodeURIComponent(periodId)}/check_ins?filter=attendee&per_page=100`,
          accessToken,
        );
        checkIns.push(...collection.data);
      }
      const { uniqueAttendees, totalCheckIns } = summarizeCheckIns(checkIns);
      const values = {
        eventId,
        eventName,
        eventArchived: archived,
        weekStart: week.weekStart,
        weekEnd: addDays(week.weekStart, 7),
        uniqueAttendees,
        totalCheckIns,
        sessions: week.periodIds.length,
        fetchedAt: new Date(),
      };
      await db.insert(checkinsWeeklyHistoryTable).values(values).onConflictDoUpdate({
        target: [checkinsWeeklyHistoryTable.eventId, checkinsWeeklyHistoryTable.weekStart],
        set: {
          eventName: values.eventName,
          eventArchived: values.eventArchived,
          weekEnd: values.weekEnd,
          uniqueAttendees: values.uniqueAttendees,
          totalCheckIns: values.totalCheckIns,
          sessions: values.sessions,
          fetchedAt: values.fetchedAt,
        },
      });
      saved.push({ weekStart: week.weekStart, uniqueAttendees, totalCheckIns, sessions: values.sessions });
    }
    res.json({ saved });
  } catch (error) {
    sendError(req, res, error, "Failed to pull attendance for these weeks");
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
