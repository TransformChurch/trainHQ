// "Group attendance history" -- a one-time (safely re-runnable) pull of
// Planning Center Groups attendance for every group, binned by week, into
// groups_weekly_history. The Groups counterpart of attendanceHistory.ts
// (Check-Ins events), driven the same way from the admin page: list groups
// -> list one group's weeks -> pull a few weeks at a time, so no request
// runs long and a stopped pull can simply be re-run (rows upsert per
// group + week).
//
// Read-only against Planning Center: every call is a GET. Needs the PCO
// OAuth scope "groups" (same as the Weekly Pulse's Groups section).
//
// The attendance endpoint (GET /groups/v2/events/{id}/attendances) is the
// same one the Weekly Pulse uses. Each Attendance record is one roster
// member for that meeting with an `attended` flag, so "attendees" counts
// unique people marked present; a week whose meetings returned no records at
// all is saved as attendees = NULL (attendance not taken), not 0.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, groupsWeeklyHistoryTable } from "@workspace/db";
import { asc, count, countDistinct, max, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";
import { getValidPlanningCenterAccessToken } from "../lib/planningCenter";
import { addDays, weekStartFor } from "../lib/checkinsHistory";
import { summarizeGroupAttendance } from "../lib/groupAttendance";
import { type JsonApiResource, fetchCollection, firstValue, planningCenterRequest, text } from "./reports";

const router: IRouter = Router();

const GROUPS_BASE = "https://api.planningcenteronline.com/groups/v2";
export { summarizeGroupAttendance };

export const MAX_GROUP_WEEKS_PER_REQUEST = 8;
export const MAX_GROUP_MEETINGS_PER_REQUEST = 20;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const PCO_ID = /^\d{1,20}$/;

function sendError(req: Request, res: Response, error: unknown, fallback: string) {
  const typed = error as Error & { status?: number; details?: string };
  req.log.error({ err: error, details: typed.details }, fallback);
  // planningCenterRequest's 401/403 message mentions Check-Ins; say Groups here.
  const message = typed.status === 403
    ? "Planning Center Groups access is missing. Click \"Reconnect Church Center\" and approve Groups access."
    : typed.message || fallback;
  res.status(typed.status ?? 500).json({ error: message });
}

export type GroupWeek = { weekStart: string; weekEnd: string; meetingIds: string[] };

// A group's meetings (not canceled, already started, on/after `since`)
// grouped into Monday-start weeks, oldest first.
export function groupMeetingsByWeek(
  meetings: { id: string; startsAt: string; canceled: boolean }[],
  since: string,
  now: Date = new Date(),
): GroupWeek[] {
  const sinceMs = new Date(`${since}T00:00:00Z`).getTime();
  const byWeek = new Map<string, string[]>();
  for (const meeting of meetings) {
    const ms = new Date(meeting.startsAt).getTime();
    if (meeting.canceled || !Number.isFinite(ms) || ms < sinceMs || ms > now.getTime()) continue;
    const week = weekStartFor(meeting.startsAt);
    const ids = byWeek.get(week) ?? [];
    ids.push(meeting.id);
    byWeek.set(week, ids);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, meetingIds]) => ({ weekStart, weekEnd: addDays(weekStart, 7), meetingIds }));
}

function csvCell(value: unknown): string {
  let raw = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(raw)) raw = `'${raw}`;
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function buildGroupHistoryCsv(rows: {
  groupName: string;
  groupId: string;
  groupArchived: boolean;
  weekStart: string;
  weekEnd: string;
  meetings: number;
  attendees: number | null;
  attendanceRecords: number;
}[]): string {
  const header = ["Group", "Group ID", "Archived", "Week start (Mon)", "Week end", "Meetings", "Attendees (present)", "Attendance taken"];
  const lines = rows.map((row) => [
    row.groupName,
    row.groupId,
    row.groupArchived ? "Yes" : "No",
    row.weekStart,
    row.weekEnd,
    row.meetings,
    row.attendees,
    row.attendees === null ? "No" : "Yes",
  ]);
  return [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ── GET /api/group-history/groups ───────────────────────────────────────────
// Every group, including archived ones where Planning Center returns them.
router.get("/groups", requireAdmin, async (req, res) => {
  try {
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    const current = await fetchCollection(`${GROUPS_BASE}/groups?per_page=100`, accessToken);
    // Archived groups: Planning Center's default list may leave them out. This
    // filter is best-effort -- if it isn't supported, we still have the rest.
    const archived = await fetchCollection(`${GROUPS_BASE}/groups?filter=archived&per_page=100`, accessToken)
      .catch(() => ({ data: [] as JsonApiResource[], included: [] as JsonApiResource[] }));
    const seen = new Set<string>();
    const groups: { id: string; name: string; archived: boolean }[] = [];
    for (const group of [...current.data, ...archived.data]) {
      if (!group.id || seen.has(group.id)) continue;
      seen.add(group.id);
      groups.push({
        id: group.id,
        name: firstValue(group.attributes ?? {}, "name") || `Group ${group.id}`,
        archived: !!text(group.attributes?.archived_at),
      });
    }
    groups.sort((a, b) => a.name.localeCompare(b.name));
    res.json(groups);
  } catch (error) {
    sendError(req, res, error, "Failed to load Planning Center groups");
  }
});

// ── GET /api/group-history/groups/:groupId/weeks?since=YYYY-MM-DD ───────────
router.get("/groups/:groupId/weeks", requireAdmin, async (req, res) => {
  try {
    const groupId = text(req.params.groupId);
    const since = text(req.query.since);
    if (!PCO_ID.test(groupId) || !DATE_ONLY.test(since)) {
      res.status(400).json({ error: "Invalid group id or start date." });
      return;
    }
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    const sinceIso = `${since}T00:00:00Z`;
    const meetings: { id: string; startsAt: string; canceled: boolean }[] = [];
    let url: string | null = `${GROUPS_BASE}/groups/${encodeURIComponent(groupId)}/events?order=-starts_at&per_page=100`;
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
        meetings.push({ id: row.id, startsAt, canceled: row.attributes?.canceled === true });
      }
      if (reachedOlder || meetings.length > 5_000) break;
      url = typeof page.links?.next === "string" && page.links.next ? page.links.next : null;
    }
    res.json(groupMeetingsByWeek(meetings, since));
  } catch (error) {
    sendError(req, res, error, "Failed to load this group's meetings");
  }
});

// ── POST /api/group-history/groups/:groupId/weeks ───────────────────────────
// Body: { groupName, archived, weeks: [{ weekStart, meetingIds }] }.
router.post("/groups/:groupId/weeks", requireAdmin, async (req, res) => {
  try {
    const groupId = text(req.params.groupId);
    const groupName = text(req.body?.groupName).slice(0, 300) || `Group ${groupId}`;
    const archived = req.body?.archived === true;
    const rawWeeks: unknown[] = Array.isArray(req.body?.weeks) ? req.body.weeks : [];
    const weeks = rawWeeks
      .filter((week): week is Record<string, unknown> => typeof week === "object" && week !== null)
      .map((week) => ({
        weekStart: text(week.weekStart),
        meetingIds: Array.isArray(week.meetingIds) ? week.meetingIds.map((id) => text(id)) : [],
      }));
    const totalMeetings = weeks.reduce((sum, week) => sum + week.meetingIds.length, 0);
    const valid =
      PCO_ID.test(groupId) &&
      weeks.length > 0 &&
      weeks.length <= MAX_GROUP_WEEKS_PER_REQUEST &&
      totalMeetings <= MAX_GROUP_MEETINGS_PER_REQUEST &&
      weeks.every((week) =>
        DATE_ONLY.test(week.weekStart) &&
        weekStartFor(`${week.weekStart}T12:00:00Z`) === week.weekStart &&
        week.meetingIds.length > 0 &&
        week.meetingIds.every((id) => PCO_ID.test(id)));
    if (!valid) {
      res.status(400).json({
        error: `Send 1-${MAX_GROUP_WEEKS_PER_REQUEST} Monday-start weeks with at most ${MAX_GROUP_MEETINGS_PER_REQUEST} meetings in total.`,
      });
      return;
    }

    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    const saved = [];
    const fetchedAt = new Date();
    for (const week of weeks) {
      const records: JsonApiResource[] = [];
      for (const meetingId of week.meetingIds) {
        const collection = await fetchCollection(
          `${GROUPS_BASE}/events/${encodeURIComponent(meetingId)}/attendances?per_page=100`,
          accessToken,
        );
        records.push(...collection.data);
      }
      const { attendees, attendanceRecords } = summarizeGroupAttendance(records);
      const values = {
        groupId,
        groupName,
        groupArchived: archived,
        weekStart: week.weekStart,
        weekEnd: addDays(week.weekStart, 7),
        meetings: week.meetingIds.length,
        attendees,
        attendanceRecords,
        fetchedAt,
      };
      const { groupId: _groupId, weekStart: _weekStart, ...update } = values;
      await db.insert(groupsWeeklyHistoryTable).values(values).onConflictDoUpdate({
        target: [groupsWeeklyHistoryTable.groupId, groupsWeeklyHistoryTable.weekStart],
        set: update,
      });
      saved.push({ weekStart: week.weekStart, attendees, meetings: values.meetings });
    }
    res.json({ saved });
  } catch (error) {
    sendError(req, res, error, "Failed to pull group attendance for these weeks");
  }
});

// ── GET /api/group-history/summary ──────────────────────────────────────────
router.get("/summary", requireAdmin, async (req, res) => {
  try {
    const [row] = await db.select({
      rows: count(),
      groups: countDistinct(groupsWeeklyHistoryTable.groupId),
      firstWeek: sql<string | null>`min(${groupsWeeklyHistoryTable.weekStart})`,
      lastWeek: sql<string | null>`max(${groupsWeeklyHistoryTable.weekStart})`,
      lastFetchedAt: max(groupsWeeklyHistoryTable.fetchedAt),
    }).from(groupsWeeklyHistoryTable);
    res.json(row);
  } catch (error) {
    sendError(req, res, error, "Failed to load group history summary");
  }
});

// ── GET /api/group-history/history.csv ──────────────────────────────────────
router.get("/history.csv", requireAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(groupsWeeklyHistoryTable)
      .orderBy(asc(groupsWeeklyHistoryTable.groupName), asc(groupsWeeklyHistoryTable.weekStart));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="group-attendance-history-by-week.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.send("﻿" + buildGroupHistoryCsv(rows));
  } catch (error) {
    sendError(req, res, error, "Failed to download group history");
  }
});

export default router;
