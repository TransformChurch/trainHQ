// Engagement dashboard numbers (2026-10-27), computed from the
// engagement_weeks / engagement_attendance tables. Pure: no database, so the
// math is unit-tested directly (engagementMetrics.test.ts).
//
// A "window" is the last N Monday weeks ending with the most recent full
// week. Within it:
//   held weeks       -- weeks with at least one person present (a week with
//                       sessions but nobody present is a week off, like the
//                       reports' "0 (week off)", and doesn't count)
//   avg attendance   -- people present per held week
//   avg new guests   -- first-time guests per held week
//   unique attendees -- different people present at least once
//   attendance rate  -- average over those people of (weeks present / held weeks)
//   engagement       -- lib/engagement.ts score over those people
import { addDays } from "./checkinsHistory";
import { summarizeEngagement, type EngagementSummary, type EngagementWeights, type PersonFlags } from "./engagement";

export type WeekRow = { weekStart: string; sessions: number; attendees: number | null; firstTimers: number };
export type PresenceRow = { weekStart: string; personId: string };

export type WindowMetrics = {
  from: string;          // first week start in the window
  to: string;            // last week start in the window
  heldWeeks: number;
  avgAttendance: number | null;
  avgNewGuests: number | null;
  uniqueAttendees: number;
  attendanceRate: number | null; // 0..1
  engagement: EngagementSummary;
};

export function windowWeeks(lastWeekStart: string, weeks: number): string[] {
  return Array.from({ length: weeks }, (_, index) => addDays(lastWeekStart, -7 * (weeks - 1 - index)));
}

// Per person: weeks present / held weeks in the window (0..1).
export function personRates(weekRows: WeekRow[], presence: PresenceRow[], window: string[]): Map<string, number> {
  const inWindow = new Set(window);
  const held = new Set(weekRows.filter((row) => inWindow.has(row.weekStart) && (row.attendees ?? 0) > 0).map((row) => row.weekStart));
  const weeksByPerson = new Map<string, Set<string>>();
  for (const row of presence) {
    if (!held.has(row.weekStart)) continue;
    const set = weeksByPerson.get(row.personId) ?? new Set<string>();
    set.add(row.weekStart);
    weeksByPerson.set(row.personId, set);
  }
  const rates = new Map<string, number>();
  for (const [personId, weeks] of weeksByPerson) rates.set(personId, held.size ? Math.min(1, weeks.size / held.size) : 0);
  return rates;
}

export function windowMetrics(
  weekRows: WeekRow[],
  presence: PresenceRow[],
  window: string[],
  flags: Map<string, PersonFlags>,
  weights: EngagementWeights,
): WindowMetrics {
  const inWindow = new Set(window);
  const held = weekRows.filter((row) => inWindow.has(row.weekStart) && (row.attendees ?? 0) > 0);
  const rates = personRates(weekRows, presence, window);
  const people = [...rates.entries()].map(([personId, attendanceRate]) => ({ personId, attendanceRate }));
  const rateValues = [...rates.values()];
  return {
    from: window[0],
    to: window[window.length - 1],
    heldWeeks: held.length,
    avgAttendance: held.length ? held.reduce((sum, row) => sum + (row.attendees ?? 0), 0) / held.length : null,
    avgNewGuests: held.length ? held.reduce((sum, row) => sum + row.firstTimers, 0) / held.length : null,
    uniqueAttendees: rates.size,
    attendanceRate: rateValues.length ? rateValues.reduce((sum, rate) => sum + rate, 0) / rateValues.length : null,
    engagement: summarizeEngagement(people, flags, weights),
  };
}

export type TrendPoint = {
  weekStart: string;
  attendees: number | null;     // that week (null = no sessions / not taken)
  newGuests: number | null;
  rollingRate: number | null;   // attendance rate over the N weeks ending this week
  rollingAvgAttendance: number | null;
};

// The last `points` weeks, each with its rolling-N numbers. A rolling value
// whose window starts before the item's first saved week is left empty
// (a partial window would read artificially high).
export function trendSeries(weekRows: WeekRow[], presence: PresenceRow[], lastWeekStart: string, weeks: number, points: number): TrendPoint[] {
  const byWeek = new Map(weekRows.map((row) => [row.weekStart, row]));
  const firstSaved = weekRows.map((row) => row.weekStart).sort()[0] ?? null;
  return windowWeeks(lastWeekStart, points).map((weekStart) => {
    const window = windowWeeks(weekStart, weeks);
    const row = byWeek.get(weekStart);
    if (!firstSaved || window[0] < firstSaved) {
      return { weekStart, attendees: row ? row.attendees : null, newGuests: row && (row.attendees ?? 0) > 0 ? row.firstTimers : null, rollingRate: null, rollingAvgAttendance: null };
    }
    const inWindow = new Set(window);
    const held = weekRows.filter((row) => inWindow.has(row.weekStart) && (row.attendees ?? 0) > 0);
    const rates = [...personRates(weekRows, presence, window).values()];
    return {
      weekStart,
      attendees: row ? row.attendees : null,
      newGuests: row && (row.attendees ?? 0) > 0 ? row.firstTimers : null,
      rollingRate: rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null,
      rollingAvgAttendance: held.length ? held.reduce((sum, item) => sum + (item.attendees ?? 0), 0) / held.length : null,
    };
  });
}

// Every tracked item together: unique people across items; a person in
// several items gets the average of their per-item rates; weekly averages
// add up across items.
export function combinedMetrics(
  perItem: { weekRows: WeekRow[]; presence: PresenceRow[] }[],
  window: string[],
  flags: Map<string, PersonFlags>,
  weights: EngagementWeights,
): Omit<WindowMetrics, "engagement"> & { engagement: EngagementSummary } {
  const ratesByPerson = new Map<string, number[]>();
  let avgAttendance: number | null = null;
  let avgNewGuests: number | null = null;
  let heldWeeks = 0;
  for (const item of perItem) {
    const metrics = windowMetrics(item.weekRows, item.presence, window, new Map(), weights);
    heldWeeks = Math.max(heldWeeks, metrics.heldWeeks);
    if (metrics.avgAttendance !== null) avgAttendance = (avgAttendance ?? 0) + metrics.avgAttendance;
    if (metrics.avgNewGuests !== null) avgNewGuests = (avgNewGuests ?? 0) + metrics.avgNewGuests;
    for (const [personId, rate] of personRates(item.weekRows, item.presence, window)) {
      ratesByPerson.set(personId, [...(ratesByPerson.get(personId) ?? []), rate]);
    }
  }
  const people = [...ratesByPerson.entries()].map(([personId, rates]) => ({
    personId,
    attendanceRate: rates.reduce((sum, rate) => sum + rate, 0) / rates.length,
  }));
  return {
    from: window[0],
    to: window[window.length - 1],
    heldWeeks,
    avgAttendance,
    avgNewGuests,
    uniqueAttendees: people.length,
    attendanceRate: people.length ? people.reduce((sum, person) => sum + (person.attendanceRate ?? 0), 0) / people.length : null,
    engagement: summarizeEngagement(people, flags, weights),
  };
}

// Groups have no Planning Center "first time" flag: someone counts as new the
// first week they appear for the item, but only once the item has at least
// `minHistoryWeeks` of earlier weeks stored -- before that we can't tell a
// newcomer from someone who came before our records start.
export function groupFirstTimers(
  earlierWeeks: string[],
  earlierPeople: Set<string>,
  weekStart: string,
  present: string[],
  minHistoryWeeks = 8,
): Set<string> {
  const historyStart = earlierWeeks.length ? [...earlierWeeks].sort()[0] : null;
  if (!historyStart || historyStart > addDays(weekStart, -7 * minHistoryWeeks)) return new Set();
  return new Set(present.filter((personId) => !earlierPeople.has(personId)));
}
