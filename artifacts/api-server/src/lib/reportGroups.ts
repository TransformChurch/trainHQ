// Season reports (2026-10-15): pure helpers for building a report from
// Planning Center Groups attendance instead of Check-Ins, plus the bits of a
// season report that apply to both sources (night names, season label).
//
// Transform groups other than Young Adults take attendance in Planning Center
// Groups, and they start new groups every season, so a season is either a
// date range or simply "every meeting these groups had".
//
// Kept free of database and route imports so it can be unit tested directly.
import { CHURCH_TIME_ZONE } from "./reportPeriods";

export type GroupResource = {
  id: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string; type?: string } | null }>;
};

export type GroupMeeting = { id: string; groupId: string; startsAt: string; name: string; canceled: boolean };

export type GroupSeason = {
  // One column per distinct meeting date (church time zone), oldest first,
  // including dates nobody was marked present (shown as 0, not counted in
  // attendance rates -- same rule as Check-Ins "weeks off").
  serviceDates: string[];
  skippedDates: string[];
  // person id -> dates they were marked present
  presentByPerson: Map<string, Set<string>>;
  // date -> meeting name (only when every meeting that date shares one name)
  weekLabels: Record<string, string>;
  // attendance records marked present (the "check-ins" count shown after prepare)
  presentRecords: number;
  // dates whose meetings had no attendance records at all (leader didn't take it)
  notTakenDates: string[];
};

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHURCH_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

// A Planning Center timestamp's calendar date in the church's time zone, so a
// 7:30 PM Eastern meeting (00:30 UTC the next day in winter) lands on the
// right night.
export function churchDateOf(startsAt: string): string {
  const ms = Date.parse(startsAt);
  if (!Number.isFinite(ms)) return startsAt.slice(0, 10);
  const parts = dateFormatter.formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// The meetings that belong in the report: not canceled, already started, and
// inside [startDate, endDate] when a range is given (blank = the groups' own
// dates, i.e. every meeting so far).
export function meetingsInSeason(
  meetings: GroupMeeting[],
  startDate: string,
  endDate: string,
  now: Date = new Date(),
): GroupMeeting[] {
  return meetings
    .filter((meeting) => {
      if (meeting.canceled) return false;
      const ms = Date.parse(meeting.startsAt);
      if (!Number.isFinite(ms) || ms > now.getTime()) return false;
      const date = churchDateOf(meeting.startsAt);
      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;
      return true;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function relId(resource: GroupResource, name: string): string {
  const id = resource.relationships?.[name]?.data?.id;
  return typeof id === "string" ? id : "";
}

// Groups attendance has one record per roster member per meeting with an
// `attended` flag (absent members included); a record without the flag
// counts as present, matching lib/groupAttendance.ts.
export function buildGroupSeason(
  meetings: GroupMeeting[],
  attendanceByMeeting: Map<string, GroupResource[]>,
): GroupSeason {
  const dateOf = new Map(meetings.map((meeting) => [meeting.id, churchDateOf(meeting.startsAt)]));
  const dates = [...new Set(dateOf.values())].sort();
  const presentByPerson = new Map<string, Set<string>>();
  const presentDates = new Set<string>();
  const recordDates = new Set<string>();
  let presentRecords = 0;
  for (const meeting of meetings) {
    const date = dateOf.get(meeting.id)!;
    const records = attendanceByMeeting.get(meeting.id) ?? [];
    if (records.length) recordDates.add(date);
    for (const record of records) {
      if (record.attributes?.attended === false) continue;
      const person = relId(record, "person");
      if (!person) continue;
      presentRecords += 1;
      presentDates.add(date);
      const set = presentByPerson.get(person) ?? new Set<string>();
      set.add(date);
      presentByPerson.set(person, set);
    }
  }
  const namesByDate = new Map<string, Set<string>>();
  for (const meeting of meetings) {
    const name = meeting.name.trim();
    const date = dateOf.get(meeting.id)!;
    const set = namesByDate.get(date) ?? new Set<string>();
    set.add(name);
    namesByDate.set(date, set);
  }
  const weekLabels: Record<string, string> = {};
  for (const [date, names] of namesByDate) {
    const [only] = [...names];
    if (names.size === 1 && only) weekLabels[date] = only;
  }
  return {
    serviceDates: dates,
    skippedDates: dates.filter((date) => !presentDates.has(date)),
    presentByPerson,
    weekLabels,
    presentRecords,
    notTakenDates: dates.filter((date) => !recordDates.has(date)),
  };
}

export type GroupMembership = { groupId: string; joinedAt: string };

// First-timers for a Groups season: Groups has no "first time" flag, so a
// person counts as new when they have no membership in any OTHER group that
// started before the season's first night -- i.e. this season is their first
// time in a group. (Their membership in this season's own group usually
// starts before night one -- leaders add people ahead of time -- so those are
// ignored.) People whose memberships couldn't be read are left out.
export function groupFirstTimers(
  membershipsByPerson: Map<string, GroupMembership[]>,
  seasonGroupIds: Set<string>,
  seasonStart: string,
): Set<string> {
  const result = new Set<string>();
  for (const [person, memberships] of membershipsByPerson) {
    const earlier = memberships.some((membership) =>
      !seasonGroupIds.has(membership.groupId)
      && (!membership.joinedAt || churchDateOf(membership.joinedAt) < seasonStart),
    );
    if (!earlier) result.add(person);
  }
  return result;
}

const DATE_IN_LINE = /^\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*[-:–—,]?\s*(.*)$/;

// Night names typed on the Reporting page, one per line: "1/15 Relationship
// Panel" or "2026-01-15: Relationship Panel". Matched to the report's dates by
// month/day (and year, when given). Lines that match no date are returned so
// the page can say so.
export function parseWeekLabels(text: string, serviceDates: string[]): { labels: Record<string, string>; unmatched: string[] } {
  const labels: Record<string, string> = {};
  const unmatched: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(DATE_IN_LINE);
    const name = match?.[2]?.trim() ?? "";
    if (!match || !name) {
      unmatched.push(line);
      continue;
    }
    let year = 0;
    let month = 0;
    let day = 0;
    if (match[1].includes("-")) {
      [year, month, day] = match[1].split("-").map(Number);
    } else {
      const parts = match[1].split("/").map(Number);
      [month, day] = parts;
      if (parts[2]) year = parts[2] < 100 ? 2000 + parts[2] : parts[2];
    }
    const date = serviceDates.find((value) => {
      const [y, m, d] = value.split("-").map(Number);
      return m === month && d === day && (!year || y === year);
    });
    if (date) labels[date] = name.slice(0, 60);
    else unmatched.push(line);
  }
  return { labels, unmatched };
}

// "Winter 2026" etc. from the season's first night: Jan-Mar Winter, Apr-Jun
// Spring, Jul-Aug Summer, Sep-Dec Fall. (Same rule as report_season.py.)
export function defaultSeasonLabel(firstDate: string): string {
  const [year, month] = firstDate.split("-").map(Number);
  if (!year || !month) return "Season";
  const name = month <= 3 ? "Winter" : month <= 6 ? "Spring" : month <= 8 ? "Summer" : "Fall";
  return `${name} ${year}`;
}

// What a season report run carries besides its CSV (report_runs.meta).
export type SeasonRunMeta = {
  source: "checkins" | "groups";
  sourceName: string;
  seasonLabel: string;
  startDate: string;
  endDate: string;
  weekLabels: Record<string, string>;
};

export function parseRunMeta(raw: string | null | undefined): SeasonRunMeta | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as SeasonRunMeta;
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}
