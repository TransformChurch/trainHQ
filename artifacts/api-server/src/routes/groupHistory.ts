// "Group attendance history" -- Planning Center Groups attendance for every
// group, binned by week, into groups_weekly_history (the master group
// tracker). Two ways in:
//  - Manual pulls from the admin page (list groups -> list one group's weeks
//    -> pull a few weeks at a time). Only groups that existed during the
//    chosen timeframe are visited, and by default only weeks not saved yet,
//    so a re-run fills gaps instead of re-pulling everything.
//  - A weekly automatic sync (Worker Cron Trigger, Monday ~3am Eastern) that
//    slowly re-pulls the last few weeks for currently active groups and
//    fills any recent missing weeks, appending to the tracker.
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
import { timingSafeEqual } from "node:crypto";
import { db, groupsWeeklyHistoryTable, settingsTable } from "@workspace/db";
import { and, asc, count, countDistinct, eq, gte, lt, max, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
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

// Planning Center answers 403 both when the connection lacks the Groups
// scope and when this admin simply can't see one particular group. The
// message says which is likely; the client treats a 403 on a single group as
// "skip this group", not "stop everything".
function describeError(error: unknown, fallback: string): { status: number; message: string } {
  const typed = error as Error & { status?: number };
  if (typed.status === 403) {
    return {
      status: 403,
      message: "Planning Center refused access (403). If every group fails, click \"Reconnect Church Center\" and approve Groups access; if only some do, your account can't view those groups.",
    };
  }
  return { status: typed.status ?? 500, message: typed.message || fallback };
}

function sendError(req: Request, res: Response, error: unknown, fallback: string) {
  const typed = error as Error & { details?: string };
  req.log.error({ err: error, details: typed.details }, fallback);
  const { status, message } = describeError(error, fallback);
  res.status(status).json({ error: message });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

// ── Core pull logic (shared by the routes and the weekly auto-sync) ─────────

export type GroupInfo = { id: string; name: string; archived: boolean; createdAt: string | null; archivedAt: string | null };

// A group "could have met" in [since, until) unless it was created after the
// window ended or archived before it began. Missing dates never exclude.
export function groupActiveInRange(group: Pick<GroupInfo, "createdAt" | "archivedAt">, since: string, until: string): boolean {
  if (group.createdAt && group.createdAt.slice(0, 10) >= until) return false;
  if (group.archivedAt && group.archivedAt.slice(0, 10) < since) return false;
  return true;
}

export async function listGroups(accessToken: string): Promise<GroupInfo[]> {
  const current = await fetchCollection(`${GROUPS_BASE}/groups?per_page=100`, accessToken);
  // Archived groups: Planning Center's default list may leave them out. This
  // filter is best-effort -- if it isn't supported, we still have the rest.
  const archived = await fetchCollection(`${GROUPS_BASE}/groups?filter=archived&per_page=100`, accessToken)
    .catch(() => ({ data: [] as JsonApiResource[], included: [] as JsonApiResource[] }));
  const seen = new Set<string>();
  const groups: GroupInfo[] = [];
  for (const group of [...current.data, ...archived.data]) {
    if (!group.id || seen.has(group.id)) continue;
    seen.add(group.id);
    const archivedAt = text(group.attributes?.archived_at) || null;
    groups.push({
      id: group.id,
      name: firstValue(group.attributes ?? {}, "name") || `Group ${group.id}`,
      archived: !!archivedAt,
      createdAt: text(group.attributes?.created_at) || null,
      archivedAt,
    });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

// A group's meetings since `since`, grouped into Monday weeks.
export async function listGroupWeeks(accessToken: string, groupId: string, since: string, delayMs = 0): Promise<GroupWeek[]> {
  const sinceIso = `${since}T00:00:00Z`;
  const meetings: { id: string; startsAt: string; canceled: boolean }[] = [];
  let url: string | null = `${GROUPS_BASE}/groups/${encodeURIComponent(groupId)}/events?order=-starts_at&per_page=100`;
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
      meetings.push({ id: row.id, startsAt, canceled: row.attributes?.canceled === true });
    }
    if (reachedOlder || meetings.length > 5_000) break;
    url = typeof page.links?.next === "string" && page.links.next ? page.links.next : null;
  }
  return groupMeetingsByWeek(meetings, since);
}

// Pulls attendance for the given weeks of one group and upserts a row per week.
export async function pullGroupWeeks(
  accessToken: string,
  group: { id: string; name: string; archived: boolean },
  weeks: { weekStart: string; meetingIds: string[] }[],
  delayMs = 0,
): Promise<{ weekStart: string; attendees: number | null; meetings: number }[]> {
  const saved = [];
  const fetchedAt = new Date();
  for (const week of weeks) {
    const records: JsonApiResource[] = [];
    for (const meetingId of week.meetingIds) {
      if (delayMs) await sleep(delayMs);
      const collection = await fetchCollection(
        `${GROUPS_BASE}/events/${encodeURIComponent(meetingId)}/attendances?per_page=100`,
        accessToken,
      );
      records.push(...collection.data);
    }
    const { attendees, attendanceRecords } = summarizeGroupAttendance(records);
    const values = {
      groupId: group.id,
      groupName: group.name,
      groupArchived: group.archived,
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
  return saved;
}

// groupId -> week starts already saved in [since, until).
export async function savedGroupWeeks(since: string, until: string): Promise<Map<string, Set<string>>> {
  const rows = await db.select({ groupId: groupsWeeklyHistoryTable.groupId, weekStart: groupsWeeklyHistoryTable.weekStart })
    .from(groupsWeeklyHistoryTable)
    .where(and(gte(groupsWeeklyHistoryTable.weekStart, since), lt(groupsWeeklyHistoryTable.weekStart, until)));
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = map.get(row.groupId) ?? new Set<string>();
    set.add(row.weekStart);
    map.set(row.groupId, set);
  }
  return map;
}

// ── Weekly auto-sync ────────────────────────────────────────────────────────
// Settings live in the settings key/value table (no migration needed).
const AUTO_SYNC_KEY = "group_history_auto_sync";
// Every run re-pulls the last REFRESH_WEEKS weeks (leaders often enter
// attendance late) and fills any missing week in the last GAP_WINDOW_WEEKS.
export const AUTO_SYNC_REFRESH_WEEKS = 3;
export const AUTO_SYNC_GAP_WINDOW_WEEKS = 12;
// Pause between Planning Center calls during the scheduled run -- slow on
// purpose so a large sync never trips the API's rate limits.
const AUTO_SYNC_DELAY_MS = 800;

type AutoSyncRun = {
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "success" | "partial" | "error";
  groupsChecked: number;
  weeksSaved: number;
  failures: { group: string; error: string }[];
  message?: string;
};
type AutoSyncSettings = { enabled: boolean; userId: string | null; lastRun: AutoSyncRun | null };

export async function readAutoSync(): Promise<AutoSyncSettings> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, AUTO_SYNC_KEY)).limit(1);
  try {
    const parsed = rows[0] ? JSON.parse(rows[0].value) : {};
    return { enabled: parsed.enabled === true, userId: parsed.userId ?? null, lastRun: parsed.lastRun ?? null };
  } catch {
    return { enabled: false, userId: null, lastRun: null };
  }
}

export async function writeAutoSync(settings: AutoSyncSettings): Promise<void> {
  const value = JSON.stringify(settings);
  await db.insert(settingsTable).values({ key: AUTO_SYNC_KEY, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

// Which weeks the auto-sync pulls for one group: every recent week, plus any
// older week in the gap window that has meetings but no saved row.
export function weeksToSync(
  weeks: GroupWeek[],
  saved: Set<string> | undefined,
  refreshFrom: string,
): GroupWeek[] {
  return weeks.filter((week) => week.weekStart >= refreshFrom || !saved?.has(week.weekStart));
}

let autoSyncRunning = false;

export async function runGroupAutoSync(
  now: Date = new Date(),
  // Injectable for tests; production uses the stored Planning Center connection.
  getToken: (userId: string) => Promise<string> = getValidPlanningCenterAccessToken,
  delayMs: number = AUTO_SYNC_DELAY_MS,
): Promise<AutoSyncRun> {
  const settings = await readAutoSync();
  const startedAt = new Date().toISOString();
  if (!settings.enabled || !settings.userId) {
    return { startedAt, finishedAt: startedAt, status: "error", groupsChecked: 0, weeksSaved: 0, failures: [], message: "Automatic sync is turned off." };
  }
  if (autoSyncRunning) {
    return { startedAt, finishedAt: startedAt, status: "error", groupsChecked: 0, weeksSaved: 0, failures: [], message: "A sync is already running." };
  }
  autoSyncRunning = true;
  const run: AutoSyncRun = { startedAt, finishedAt: null, status: "running", groupsChecked: 0, weeksSaved: 0, failures: [] };
  try {
    await writeAutoSync({ ...settings, lastRun: run });
    const thisWeek = weekStartFor(now.toISOString());
    const refreshFrom = addDays(thisWeek, -7 * AUTO_SYNC_REFRESH_WEEKS);
    const gapFrom = addDays(thisWeek, -7 * AUTO_SYNC_GAP_WINDOW_WEEKS);
    const until = addDays(thisWeek, 7);
    let accessToken = await getToken(settings.userId);
    const groups = (await listGroups(accessToken)).filter((group) => groupActiveInRange(group, gapFrom, until));
    const saved = await savedGroupWeeks(gapFrom, until);
    let consecutiveFailures = 0;
    for (const group of groups) {
      try {
        accessToken = await getToken(settings.userId);
        await sleep(delayMs);
        const weeks = weeksToSync(await listGroupWeeks(accessToken, group.id, gapFrom, delayMs), saved.get(group.id), refreshFrom);
        const result = await pullGroupWeeks(accessToken, group, weeks, delayMs);
        run.weeksSaved += result.length;
        consecutiveFailures = 0;
      } catch (error) {
        run.failures.push({ group: group.name, error: describeError(error, "Request failed").message });
        consecutiveFailures += 1;
        // Several failures in a row usually means rate limiting: back off.
        if (consecutiveFailures >= 3) await sleep(delayMs ? 60_000 : 0);
      } finally {
        run.groupsChecked += 1;
      }
    }
    run.status = run.failures.length ? (run.failures.length === groups.length && groups.length ? "error" : "partial") : "success";
  } catch (error) {
    run.status = "error";
    run.message = describeError(error, "Automatic sync failed").message;
  } finally {
    run.finishedAt = new Date().toISOString();
    autoSyncRunning = false;
    const latest = await readAutoSync().catch(() => settings);
    await writeAutoSync({ ...latest, lastRun: run }).catch((error) => logger.error({ err: error }, "Could not save group auto-sync result"));
  }
  return run;
}

function secretsMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

// ── GET /api/group-history/groups?since=&until= ─────────────────────────────
// Every group; with since/until, only groups that existed in that window.
router.get("/groups", requireAdmin, async (req, res) => {
  try {
    const since = text(req.query.since);
    const until = text(req.query.until);
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    let groups = await listGroups(accessToken);
    const total = groups.length;
    if (DATE_ONLY.test(since) && DATE_ONLY.test(until)) {
      groups = groups.filter((group) => groupActiveInRange(group, since, until));
    }
    res.json({ groups, total });
  } catch (error) {
    sendError(req, res, error, "Failed to load Planning Center groups");
  }
});

// ── GET /api/group-history/saved-weeks?since=&until= ────────────────────────
// { [groupId]: weekStart[] } already saved -- lets a manual pull skip them.
router.get("/saved-weeks", requireAdmin, async (req, res) => {
  try {
    const since = text(req.query.since);
    const until = text(req.query.until);
    if (!DATE_ONLY.test(since) || !DATE_ONLY.test(until)) {
      res.status(400).json({ error: "since and until (YYYY-MM-DD) are required." });
      return;
    }
    const saved = await savedGroupWeeks(since, until);
    res.json(Object.fromEntries([...saved].map(([groupId, weeks]) => [groupId, [...weeks].sort()])));
  } catch (error) {
    sendError(req, res, error, "Failed to load saved group weeks");
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
    res.json(await listGroupWeeks(accessToken, groupId, since));
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
    const saved = await pullGroupWeeks(accessToken, { id: groupId, name: groupName, archived }, weeks);
    res.json({ saved });
  } catch (error) {
    sendError(req, res, error, "Failed to pull group attendance for these weeks");
  }
});

// ── GET/POST /api/group-history/auto-sync ───────────────────────────────────
// Turning it on records the admin whose Planning Center connection the
// scheduled run uses.
router.get("/auto-sync", requireAdmin, async (req, res) => {
  try {
    const settings = await readAutoSync();
    res.json({ enabled: settings.enabled, lastRun: settings.lastRun, usesYourConnection: settings.userId === res.locals.dbUser.id });
  } catch (error) {
    sendError(req, res, error, "Failed to load automatic sync settings");
  }
});

router.post("/auto-sync", requireAdmin, async (req, res) => {
  try {
    const current = await readAutoSync();
    const enabled = req.body?.enabled === true;
    await writeAutoSync({ ...current, enabled, userId: enabled ? res.locals.dbUser.id : current.userId });
    res.json({ enabled, lastRun: current.lastRun, usesYourConnection: enabled });
  } catch (error) {
    sendError(req, res, error, "Failed to save automatic sync settings");
  }
});

// ── POST /api/group-history/run-scheduled ───────────────────────────────────
// Called by the Worker's weekly Cron Trigger (src/worker.ts), guarded by the
// same internal secret as the Weekly Pulse (WEEKLY_PULSE_RUN_SECRET). Waits
// for the run to finish (it's slow on purpose; well inside the Cron
// Trigger's time limit for a normal week).
router.post("/run-scheduled", async (req, res) => {
  const expectedSecret = process.env.WEEKLY_PULSE_RUN_SECRET;
  const providedSecret = req.header("x-internal-secret") ?? "";
  if (!expectedSecret || !providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const run = await runGroupAutoSync();
  req.log.info({ run: { ...run, failures: run.failures.length } }, "Group history auto-sync finished");
  res.json(run);
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
