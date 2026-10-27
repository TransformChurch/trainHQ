// Weekly engagement sync (2026-10-27): for each item tracked on the
// Engagement dashboard (lib/engagement.ts settings), saves who was present
// each week into engagement_weeks / engagement_attendance. Runs Mondays at
// 6:00 AM Eastern (lib/jobSchedule.ts), after the people and attendance
// syncs, and from "Sync now" in Tool Management.
//
// Read-only against Planning Center (GETs only), paced with a delay between
// calls. Per item, a run refreshes the last REFRESH_WEEKS weeks (late
// attendance entry); an item's first run backfills BACKFILL_WEEKS weeks.
// Weeks are the same Monday weeks as the other trackers (weekStartFor).
//
//  - checkins_event: attendee check-ins per session (?filter=attendee), and
//    Planning Center's first-time check-ins (?filter=first_time) for new
//    guests.
//  - group / group_type: Groups attendance per meeting; present = not marked
//    absent (lib/groupAttendance.ts rule). A group type covers every group of
//    that type that existed during the week, so tracking survives groups
//    being recreated each season. New guests: first week seen for the item,
//    once 8+ earlier weeks are on record (lib/engagementMetrics.ts).
import { db, engagementAttendanceTable, engagementWeeksTable, settingsTable } from "@workspace/db";
import { and, asc, eq, lt, notInArray } from "drizzle-orm";
import { addDays, weekStartFor } from "./checkinsHistory";
import { groupFirstTimers } from "./engagementMetrics";
import { readEngagementSettings, type TrackedItem } from "./engagement";
import { getValidPlanningCenterAccessToken } from "./planningCenter";
import { logger } from "./logger";
import { CHECK_INS_BASE, fetchCollection, relationshipId, text, type JsonApiResource } from "../routes/reports";
import { listEventPeriods } from "../routes/attendanceHistory";
import { groupActiveInRange, listGroupWeeks } from "../routes/groupHistory";

const GROUPS_BASE = "https://api.planningcenteronline.com/groups/v2";
export const REFRESH_WEEKS = 3;
export const BACKFILL_WEEKS = 26;
export const RETAIN_WEEKS = 60;
const DELAY_MS = 500;
const STATE_KEY = "engagement_sync_state";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const itemKey = (item: Pick<TrackedItem, "kind" | "id">) => `${item.kind}:${item.id}`;

export type EngagementSyncRun = {
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "success" | "partial" | "error";
  trigger: "scheduled" | "manual";
  itemsChecked: number;
  weeksSaved: number;
  failures: { item: string; error: string }[];
  message?: string;
};

type SyncState = { items: Record<string, { pulledFrom: string; lastSyncedAt: string }>; lastRun: EngagementSyncRun | null };

export async function readSyncState(): Promise<SyncState> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, STATE_KEY)).limit(1);
  try {
    const parsed = rows[0] ? JSON.parse(rows[0].value) : {};
    return { items: parsed.items && typeof parsed.items === "object" ? parsed.items : {}, lastRun: parsed.lastRun ?? null };
  } catch {
    return { items: {}, lastRun: null };
  }
}

async function writeSyncState(state: SyncState): Promise<void> {
  const value = JSON.stringify(state);
  await db.insert(settingsTable).values({ key: STATE_KEY, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

// Where an item's pull starts this run.
export function syncFrom(pulledFrom: string | undefined, thisWeek: string): string {
  const backfillFrom = addDays(thisWeek, -7 * BACKFILL_WEEKS);
  if (!pulledFrom || pulledFrom > backfillFrom) return backfillFrom;
  return addDays(thisWeek, -7 * REFRESH_WEEKS);
}

type PulledWeek = {
  weekStart: string;
  sessions: number;
  present: Set<string>;
  roster: Set<string> | null; // groups only
  taken: boolean;             // groups: any attendance records at all
  firstTime: Set<string>;     // check-ins only (groups computed on save)
};

function emptyWeek(weekStart: string, groups: boolean): PulledWeek {
  return { weekStart, sessions: 0, present: new Set(), roster: groups ? new Set() : null, taken: !groups, firstTime: new Set() };
}

async function pullCheckinsEvent(accessToken: string, eventId: string, since: string, delayMs: number): Promise<PulledWeek[]> {
  const periods = await listEventPeriods(accessToken, eventId, since, delayMs);
  const weeks = new Map<string, PulledWeek>();
  for (const period of periods) {
    if (new Date(period.startsAt).getTime() > Date.now()) continue;
    const weekStart = weekStartFor(period.startsAt);
    const week = weeks.get(weekStart) ?? emptyWeek(weekStart, false);
    week.sessions += 1;
    const base = `${CHECK_INS_BASE}/events/${encodeURIComponent(eventId)}/event_periods/${encodeURIComponent(period.id)}/check_ins`;
    if (delayMs) await sleep(delayMs);
    const attendees = await fetchCollection(`${base}?filter=attendee&per_page=100`, accessToken);
    for (const checkIn of attendees.data) {
      const person = relationshipId(checkIn, "person");
      if (person) week.present.add(person);
    }
    if (delayMs) await sleep(delayMs);
    const firstTime = await fetchCollection(`${base}?filter=first_time&per_page=100`, accessToken);
    for (const checkIn of firstTime.data) {
      const person = relationshipId(checkIn, "person");
      if (person && week.present.has(person)) week.firstTime.add(person);
    }
    weeks.set(weekStart, week);
  }
  return [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

async function pullGroups(accessToken: string, groupIds: string[], since: string, delayMs: number): Promise<PulledWeek[]> {
  const weeks = new Map<string, PulledWeek>();
  for (const groupId of groupIds) {
    if (delayMs) await sleep(delayMs);
    for (const groupWeek of await listGroupWeeks(accessToken, groupId, since, delayMs)) {
      const week = weeks.get(groupWeek.weekStart) ?? emptyWeek(groupWeek.weekStart, true);
      for (const meetingId of groupWeek.meetingIds) {
        if (delayMs) await sleep(delayMs);
        const records = await fetchCollection(`${GROUPS_BASE}/events/${encodeURIComponent(meetingId)}/attendances?per_page=100`, accessToken);
        week.sessions += 1;
        if (records.data.length) week.taken = true;
        for (const record of records.data) {
          const person = relationshipId(record, "person");
          if (!person) continue;
          week.roster!.add(person);
          if (record.attributes?.attended !== false) week.present.add(person);
        }
      }
      weeks.set(groupWeek.weekStart, week);
    }
  }
  return [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// Every group (current and archived) of a group type that existed in [since, now).
async function groupsOfType(accessToken: string, groupTypeId: string, since: string): Promise<string[]> {
  const [current, archived] = await Promise.all([
    fetchCollection(`${GROUPS_BASE}/groups?per_page=100`, accessToken),
    fetchCollection(`${GROUPS_BASE}/groups?filter=archived&per_page=100`, accessToken)
      .catch(() => ({ data: [] as JsonApiResource[], included: [] as JsonApiResource[] })),
  ]);
  const until = addDays(weekStartFor(new Date().toISOString()), 7);
  const ids = new Set<string>();
  for (const group of [...current.data, ...archived.data]) {
    if (!group.id || relationshipId(group, "group_type") !== groupTypeId) continue;
    const info = { createdAt: text(group.attributes?.created_at) || null, archivedAt: text(group.attributes?.archived_at) || null };
    if (groupActiveInRange(info, since, until)) ids.add(group.id);
  }
  return [...ids];
}

async function saveWeeks(item: TrackedItem, weeks: PulledWeek[]): Promise<number> {
  const isGroups = item.kind !== "checkins_event";
  // Everyone seen for this item before each week, for groups' "new" rule.
  const history = isGroups
    ? await db.select({ weekStart: engagementAttendanceTable.weekStart, personId: engagementAttendanceTable.personId })
      .from(engagementAttendanceTable)
      .where(and(eq(engagementAttendanceTable.itemKind, item.kind), eq(engagementAttendanceTable.itemId, item.id)))
      .orderBy(asc(engagementAttendanceTable.weekStart))
    : [];
  const storedWeeks = isGroups
    ? (await db.select({ weekStart: engagementWeeksTable.weekStart }).from(engagementWeeksTable)
      .where(and(eq(engagementWeeksTable.itemKind, item.kind), eq(engagementWeeksTable.itemId, item.id)))).map((row) => row.weekStart)
    : [];
  const fetchedAt = new Date();
  let saved = 0;
  for (const week of weeks) {
    let firstTime = week.firstTime;
    if (isGroups) {
      const earlierWeeks = [...new Set([...storedWeeks, ...weeks.map((entry) => entry.weekStart)])].filter((value) => value < week.weekStart);
      const earlierPeople = new Set([
        ...history.filter((row) => row.weekStart < week.weekStart).map((row) => row.personId),
        ...weeks.filter((entry) => entry.weekStart < week.weekStart).flatMap((entry) => [...entry.present]),
      ]);
      firstTime = groupFirstTimers(earlierWeeks, earlierPeople, week.weekStart, [...week.present]);
    }
    const attendees = isGroups && !week.taken ? null : week.present.size;
    await db.transaction(async (tx) => {
      const values = {
        itemKind: item.kind,
        itemId: item.id,
        weekStart: week.weekStart,
        sessions: week.sessions,
        attendees,
        roster: week.roster ? week.roster.size : null,
        firstTimers: firstTime.size,
        fetchedAt,
      };
      const { itemKind: _kind, itemId: _id, weekStart: _week, ...update } = values;
      await tx.insert(engagementWeeksTable).values(values).onConflictDoUpdate({
        target: [engagementWeeksTable.itemKind, engagementWeeksTable.itemId, engagementWeeksTable.weekStart],
        set: update,
      });
      await tx.delete(engagementAttendanceTable).where(and(
        eq(engagementAttendanceTable.itemKind, item.kind),
        eq(engagementAttendanceTable.itemId, item.id),
        eq(engagementAttendanceTable.weekStart, week.weekStart),
      ));
      const rows = [...week.present].map((personId) => ({
        itemKind: item.kind, itemId: item.id, weekStart: week.weekStart, personId, firstTime: firstTime.has(personId),
      }));
      for (let index = 0; index < rows.length; index += 500) {
        await tx.insert(engagementAttendanceTable).values(rows.slice(index, index + 500)).onConflictDoNothing();
      }
    });
    saved += 1;
  }
  return saved;
}

// Drops weeks past the retention window and items no longer tracked.
async function prune(items: TrackedItem[], thisWeek: string): Promise<void> {
  const cutoff = addDays(thisWeek, -7 * RETAIN_WEEKS);
  for (const table of [engagementWeeksTable, engagementAttendanceTable] as const) {
    await db.delete(table).where(lt(table.weekStart, cutoff));
  }
  const kinds = ["checkins_event", "group", "group_type"] as const;
  for (const kind of kinds) {
    const ids = items.filter((item) => item.kind === kind).map((item) => item.id);
    for (const table of [engagementWeeksTable, engagementAttendanceTable] as const) {
      await db.delete(table).where(ids.length
        ? and(eq(table.itemKind, kind), notInArray(table.itemId, ids))
        : eq(table.itemKind, kind));
    }
  }
}

let running = false;

export async function runEngagementSync(
  trigger: EngagementSyncRun["trigger"],
  now: Date = new Date(),
  getToken: (userId: string) => Promise<string> = getValidPlanningCenterAccessToken,
  delayMs = DELAY_MS,
): Promise<EngagementSyncRun> {
  const startedAt = new Date().toISOString();
  const settings = await readEngagementSettings();
  const items = settings.dashboard.items;
  const base = { startedAt, trigger, itemsChecked: 0, weeksSaved: 0, failures: [] as EngagementSyncRun["failures"] };
  if (!items.length) return { ...base, finishedAt: startedAt, status: "success", message: "No groups or events are tracked yet." };
  if (!settings.dashboard.ownerUserId) {
    return { ...base, finishedAt: startedAt, status: "error", message: "Save the Engagement dashboard settings once so the sync has a Planning Center connection to use." };
  }
  if (running) return { ...base, finishedAt: startedAt, status: "error", message: "A sync is already running." };
  running = true;
  const run: EngagementSyncRun = { ...base, finishedAt: null, status: "running" };
  const state = await readSyncState();
  try {
    await writeSyncState({ ...state, lastRun: run });
    const thisWeek = weekStartFor(now.toISOString());
    for (const item of items) {
      try {
        const accessToken = await getToken(settings.dashboard.ownerUserId);
        const from = syncFrom(state.items[itemKey(item)]?.pulledFrom, thisWeek);
        const weeks = item.kind === "checkins_event"
          ? await pullCheckinsEvent(accessToken, item.id, from, delayMs)
          : await pullGroups(accessToken, item.kind === "group" ? [item.id] : await groupsOfType(accessToken, item.id, from), from, delayMs);
        run.weeksSaved += await saveWeeks(item, weeks);
        const previous = state.items[itemKey(item)]?.pulledFrom;
        state.items[itemKey(item)] = { pulledFrom: previous && previous < from ? previous : from, lastSyncedAt: new Date().toISOString() };
      } catch (error) {
        const typed = error as Error & { status?: number };
        run.failures.push({
          item: item.name,
          error: typed.status === 403 ? "Planning Center refused access (403) -- the owner's connection can't see this." : typed.message || "Request failed",
        });
      } finally {
        run.itemsChecked += 1;
      }
    }
    for (const key of Object.keys(state.items)) if (!items.some((item) => itemKey(item) === key)) delete state.items[key];
    await prune(items, thisWeek);
    run.status = run.failures.length ? (run.failures.length === items.length ? "error" : "partial") : "success";
  } catch (error) {
    run.status = "error";
    run.message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, "Engagement sync failed");
  } finally {
    running = false;
    run.finishedAt = new Date().toISOString();
    await writeSyncState({ ...state, lastRun: run }).catch(() => undefined);
  }
  return run;
}
