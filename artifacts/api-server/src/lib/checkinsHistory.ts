// Shared logic for the Check-Ins attendance tracker (checkins_weekly_history):
// Monday-UTC week binning, unique-attendee counting (with a gender split),
// and saving rows. Used by routes/attendanceHistory.ts (the one-time history
// pull) and routes/reports.ts (which refreshes an event's recent weeks every
// time a report is prepared, and reads them back for the trend chart).
//
// Kept free of route imports so both routes can use it without a cycle.
import { checkinsWeeklyHistoryTable, db, settingsTable } from "@workspace/db";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";

const DAY_MS = 24 * 60 * 60 * 1000;

type Resource = {
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string } | null } | undefined>;
};

function relId(resource: Resource, name: string): string {
  const id = resource.relationships?.[name]?.data?.id;
  return typeof id === "string" ? id : "";
}

// Monday 00:00 UTC on or before the given instant, as YYYY-MM-DD. Matches
// the Weekly Pulse's computeWeekRange windows.
export function weekStartFor(iso: string): string {
  const date = new Date(iso);
  date.setUTCHours(0, 0, 0, 0);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - daysSinceMonday * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(dateOnly: string, days: number): string {
  return new Date(new Date(`${dateOnly}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function normalizeGender(value: unknown): "male" | "female" | null {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (v.startsWith("m")) return "male";
  if (v.startsWith("f")) return "female";
  return null;
}

// Person id -> gender from the Person resources Planning Center returns in a
// check-ins response's `included` array (?include=person).
export function genderByPersonFromIncluded(included: Resource[]): Map<string, "male" | "female" | null> {
  const map = new Map<string, "male" | "female" | null>();
  for (const resource of included) {
    if (resource.id) map.set(resource.id, normalizeGender(resource.attributes?.gender));
  }
  return map;
}

export type WeekSummary = {
  uniqueAttendees: number;
  totalCheckIns: number;
  maleAttendees: number | null;
  femaleAttendees: number | null;
  unknownGenderAttendees: number | null;
};

// Unique people across a set of attendee check-ins. Falls back to the raw
// count if Planning Center ever omits the person link. Gender counts are
// only filled in when a person->gender lookup is supplied.
export function summarizeCheckIns(
  checkIns: Resource[],
  genderByPerson?: Map<string, "male" | "female" | null>,
): WeekSummary {
  const people = new Set(checkIns.map((checkIn) => relId(checkIn, "person")).filter(Boolean));
  const uniqueAttendees = people.size || checkIns.length;
  if (!genderByPerson) {
    return { uniqueAttendees, totalCheckIns: checkIns.length, maleAttendees: null, femaleAttendees: null, unknownGenderAttendees: null };
  }
  let male = 0;
  let female = 0;
  for (const person of people) {
    const gender = genderByPerson.get(person);
    if (gender === "male") male += 1;
    else if (gender === "female") female += 1;
  }
  return {
    uniqueAttendees,
    totalCheckIns: checkIns.length,
    maleAttendees: male,
    femaleAttendees: female,
    unknownGenderAttendees: Math.max(uniqueAttendees - male - female, 0),
  };
}

export type HistoryRow = WeekSummary & {
  weekStart: string;
  weekEnd: string;
  sessions: number;
  // First-time guests whose first check-in fell in this week, and how many
  // of them checked in again at any later service. null when unknown.
  firstTimers: number | null;
  firstTimersReturned: number | null;
};

// Bins an event's attendee check-ins into weeks using each check-in's event
// period start time, for weeks starting on/after `sinceWeek` and not after
// `now`. Weeks with no sessions produce no row. When `firstTimeCheckIns`
// (Planning Center's ?filter=first_time check-ins for the event) is given,
// each week also gets its first-time guests and how many came back later.
export function buildWeeklyHistory(
  checkIns: Resource[],
  periodStartById: Map<string, string>,
  genderByPerson: Map<string, "male" | "female" | null> | undefined,
  sinceWeek: string,
  now: Date = new Date(),
  firstTimeCheckIns?: Resource[],
): HistoryRow[] {
  const nowMs = now.getTime();
  const periodsByWeek = new Map<string, Set<string>>();
  for (const [periodId, startsAt] of periodStartById) {
    const ms = new Date(startsAt).getTime();
    if (!Number.isFinite(ms) || ms > nowMs) continue;
    const week = weekStartFor(startsAt);
    if (week < sinceWeek) continue;
    const set = periodsByWeek.get(week) ?? new Set<string>();
    set.add(periodId);
    periodsByWeek.set(week, set);
  }
  const checkInsByWeek = new Map<string, Resource[]>();
  for (const checkIn of checkIns) {
    const startsAt = periodStartById.get(relId(checkIn, "event_period"));
    if (!startsAt) continue;
    const week = weekStartFor(startsAt);
    if (!periodsByWeek.has(week)) continue;
    const list = checkInsByWeek.get(week) ?? [];
    list.push(checkIn);
    checkInsByWeek.set(week, list);
  }
  const firstTimerWeeks = firstTimeCheckIns
    ? firstTimersByWeek(checkIns, firstTimeCheckIns, periodStartById)
    : null;
  return [...periodsByWeek.keys()].sort().map((weekStart) => ({
    weekStart,
    weekEnd: addDays(weekStart, 7),
    sessions: periodsByWeek.get(weekStart)!.size,
    ...summarizeCheckIns(checkInsByWeek.get(weekStart) ?? [], genderByPerson),
    firstTimers: firstTimerWeeks ? (firstTimerWeeks.get(weekStart)?.total ?? 0) : null,
    firstTimersReturned: firstTimerWeeks ? (firstTimerWeeks.get(weekStart)?.returned ?? 0) : null,
  }));
}

// week -> { first-time guests whose first check-in was that week, how many
// of them have an attendee check-in at any later service }.
function firstTimersByWeek(
  checkIns: Resource[],
  firstTimeCheckIns: Resource[],
  periodStartById: Map<string, string>,
): Map<string, { total: number; returned: number }> {
  const firstVisit = new Map<string, number>(); // person -> first-time service time (ms)
  for (const checkIn of firstTimeCheckIns) {
    const person = relId(checkIn, "person");
    const startsAt = periodStartById.get(relId(checkIn, "event_period"));
    if (!person || !startsAt) continue;
    const ms = new Date(startsAt).getTime();
    if (!Number.isFinite(ms)) continue;
    const existing = firstVisit.get(person);
    if (existing === undefined || ms < existing) firstVisit.set(person, ms);
  }
  const lastVisit = new Map<string, number>(); // person -> latest attendee check-in (ms)
  for (const checkIn of checkIns) {
    const person = relId(checkIn, "person");
    const startsAt = periodStartById.get(relId(checkIn, "event_period"));
    if (!person || !startsAt || !firstVisit.has(person)) continue;
    const ms = new Date(startsAt).getTime();
    if (ms > (lastVisit.get(person) ?? -Infinity)) lastVisit.set(person, ms);
  }
  const byWeek = new Map<string, { total: number; returned: number }>();
  for (const [person, firstMs] of firstVisit) {
    const week = weekStartFor(new Date(firstMs).toISOString());
    const entry = byWeek.get(week) ?? { total: 0, returned: 0 };
    entry.total += 1;
    if ((lastVisit.get(person) ?? -Infinity) > firstMs) entry.returned += 1;
    byWeek.set(week, entry);
  }
  return byWeek;
}

export async function saveHistoryRows(
  event: { eventId: string; eventName: string; archived: boolean },
  rows: HistoryRow[],
): Promise<void> {
  const fetchedAt = new Date();
  for (const row of rows) {
    const values = {
      eventId: event.eventId,
      eventName: event.eventName,
      eventArchived: event.archived,
      weekStart: row.weekStart,
      weekEnd: row.weekEnd,
      uniqueAttendees: row.uniqueAttendees,
      totalCheckIns: row.totalCheckIns,
      sessions: row.sessions,
      maleAttendees: row.maleAttendees,
      femaleAttendees: row.femaleAttendees,
      unknownGenderAttendees: row.unknownGenderAttendees,
      firstTimers: row.firstTimers,
      firstTimersReturned: row.firstTimersReturned,
      fetchedAt,
    };
    // On re-save, never blank out a breakdown this source didn't compute
    // (e.g. the history pull has no first-timer data, but a report prepare
    // does) -- only overwrite optional columns this row actually has.
    const { eventId: _eventId, weekStart: _weekStart, ...rest } = values;
    const update = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== null));
    await db.insert(checkinsWeeklyHistoryTable).values(values).onConflictDoUpdate({
      target: [checkinsWeeklyHistoryTable.eventId, checkinsWeeklyHistoryTable.weekStart],
      set: update,
    });
  }
}

// The weeks the report trend chart shows: `weeks` Monday-start weeks ending
// with the week containing `endDate`, oldest first.
export async function loadTrendRows(eventId: string, endDate: string, weeks = 13) {
  const lastWeek = weekStartFor(`${endDate}T12:00:00Z`);
  const firstWeek = addDays(lastWeek, -7 * (weeks - 1));
  const own = await db.select().from(checkinsWeeklyHistoryTable)
    .where(and(
      eq(checkinsWeeklyHistoryTable.eventId, eventId),
      gte(checkinsWeeklyHistoryTable.weekStart, firstWeek),
      lte(checkinsWeeklyHistoryTable.weekStart, lastWeek),
    ));
  // Week substitutions: for an overridden week, use the source event's row
  // (e.g. a one-off concert that replaced the normal service that week).
  const overrides = (await readWeekOverrides())
    .filter((o) => o.eventId === eventId && o.weekStart >= firstWeek && o.weekStart <= lastWeek);
  const byWeek = new Map(own.map((row) => [row.weekStart, row]));
  for (const override of overrides) {
    const [source] = await db.select().from(checkinsWeeklyHistoryTable)
      .where(and(
        eq(checkinsWeeklyHistoryTable.eventId, override.sourceEventId),
        eq(checkinsWeeklyHistoryTable.weekStart, override.weekStart),
      ))
      .limit(1);
    if (source) byWeek.set(override.weekStart, source);
  }
  const rows = [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  return rows.map((row) => ({
    weekStart: row.weekStart,
    total: row.uniqueAttendees,
    male: row.maleAttendees,
    female: row.femaleAttendees,
    unknown: row.unknownGenderAttendees,
    firstTimers: row.firstTimers,
    firstTimersReturned: row.firstTimersReturned,
  }));
}

// ── Week substitutions ──────────────────────────────────────────────────────
// "For event X, the week of W, use event Y's numbers" -- for a one-off event
// (a concert, a combined night) that replaced an event's normal service.
// Stored in the settings key/value table (no migration). Only the tracker-
// based charts (attendance trend, first-timer trend) use them; Planning
// Center itself is never changed.
const WEEK_OVERRIDES_KEY = "checkins_week_overrides";

export type WeekOverride = {
  eventId: string;
  eventName: string;
  weekStart: string;
  sourceEventId: string;
  sourceEventName: string;
  createdAt: string;
};

export async function readWeekOverrides(): Promise<WeekOverride[]> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, WEEK_OVERRIDES_KEY)).limit(1);
  try {
    const parsed = rows[0] ? JSON.parse(rows[0].value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeWeekOverrides(overrides: WeekOverride[]): Promise<void> {
  const value = JSON.stringify(overrides);
  await db.insert(settingsTable).values({ key: WEEK_OVERRIDES_KEY, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

// Saved tracker numbers for the given (eventId, weekStart) pairs, for display.
export async function trackerRowsFor(pairs: { eventId: string; weekStart: string }[]) {
  if (!pairs.length) return [];
  const rows = await db.select().from(checkinsWeeklyHistoryTable)
    .where(inArray(checkinsWeeklyHistoryTable.eventId, [...new Set(pairs.map((p) => p.eventId))]));
  return rows.filter((row) => pairs.some((p) => p.eventId === row.eventId && p.weekStart === row.weekStart));
}
