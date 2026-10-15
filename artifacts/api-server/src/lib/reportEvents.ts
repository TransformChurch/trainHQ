// Pure helpers for building one report from several Check-Ins events and for
// "check-in copies" (use another event's check-ins for one week of an event --
// e.g. a concert that replaced the regular Youth night). Planning Center's
// Check-Ins API is read-only, so a copy is applied inside our report data
// only; nothing is written back to Planning Center.
//
// Kept free of database and route imports so it can be unit tested directly.
import { weekStartFor } from "./checkinsHistory";

export type Resource = {
  id: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string; type?: string } | null }>;
};

export type EventData = {
  eventId: string;
  eventName: string;
  periods: Resource[];
  checkIns: Resource[];
  included: Resource[];
  firstTime: Resource[];
};

function relId(resource: Resource, name: string): string {
  const id = resource.relationships?.[name]?.data?.id;
  return typeof id === "string" ? id : "";
}

function startsAtOf(period: Resource): string {
  const value = period.attributes?.starts_at;
  return typeof value === "string" ? value : "";
}

export function periodsInWeek(periods: Resource[], weekStart: string): Resource[] {
  return periods
    .filter((period) => {
      const startsAt = startsAtOf(period);
      return startsAt && weekStartFor(startsAt) === weekStart;
    })
    .sort((a, b) => startsAtOf(a).localeCompare(startsAtOf(b)));
}

function withPeriod(checkIn: Resource, periodId: string): Resource {
  return {
    ...checkIn,
    relationships: { ...checkIn.relationships, event_period: { data: { id: periodId } } },
  };
}

// Replaces the target event's check-ins for `weekStart` with the source
// event's check-ins from that same week. The source's check-ins are attached
// to the target's first session that week (or, if the target had no session
// that week, to a new session on the source's first date). Other target
// sessions that week are dropped so the week is one column in the report.
export function applyWeekCopy(target: EventData, weekStart: string, source: EventData): EventData {
  const sourcePeriods = periodsInWeek(source.periods, weekStart);
  if (!sourcePeriods.length) return target;
  const sourcePeriodIds = new Set(sourcePeriods.map((period) => period.id));
  const targetPeriods = periodsInWeek(target.periods, weekStart);
  const destination: Resource = targetPeriods[0]
    ?? { id: `copy-${source.eventId}-${weekStart}`, attributes: { starts_at: startsAtOf(sourcePeriods[0]) } };
  const removedPeriodIds = new Set(targetPeriods.map((period) => period.id));

  const keptPeriods = target.periods.filter((period) => !removedPeriodIds.has(period.id) || period.id === destination.id);
  if (!targetPeriods.length) keptPeriods.push(destination);

  const copiedCheckIns = source.checkIns
    .filter((checkIn) => sourcePeriodIds.has(relId(checkIn, "event_period")))
    .map((checkIn) => withPeriod(checkIn, destination.id));
  const copiedFirstTime = source.firstTime
    .filter((checkIn) => sourcePeriodIds.has(relId(checkIn, "event_period")))
    .map((checkIn) => withPeriod(checkIn, destination.id));

  return {
    ...target,
    periods: keptPeriods,
    checkIns: [
      ...target.checkIns.filter((checkIn) => !removedPeriodIds.has(relId(checkIn, "event_period"))),
      ...copiedCheckIns,
    ],
    firstTime: [
      ...target.firstTime.filter((checkIn) => !removedPeriodIds.has(relId(checkIn, "event_period"))),
      ...copiedFirstTime,
    ],
    included: [...target.included, ...source.included],
  };
}

// Several events as one: their sessions, check-ins and people are pooled.
// (Sessions that fall on the same date become one column in the report; see
// pickSessions.)
export function mergeEventData(events: EventData[]): EventData {
  return {
    eventId: events.map((event) => event.eventId).join(","),
    eventName: events.map((event) => event.eventName).join(" + "),
    periods: events.flatMap((event) => event.periods),
    checkIns: events.flatMap((event) => event.checkIns),
    included: events.flatMap((event) => event.included),
    firstTime: events.flatMap((event) => event.firstTime),
  };
}

export type PickedSession = { date: string; periodIds: string[] };

// The report's session columns: one per distinct service date, chosen from
// the periods on/before `endDate` (and on/after `startDate` for All Dates
// reports), newest `sessionCount` for month/quarter reports; oldest first.
export function pickSessions(
  periods: Resource[],
  options: { endDate: string; cleanupMode: "month_quarter" | "all_dates"; startDate: string; sessionCount: number },
): PickedSession[] {
  const byDate = new Map<string, string[]>();
  for (const period of periods) {
    const date = startsAtOf(period).match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
    if (!period.id || !date || date > options.endDate) continue;
    if (options.cleanupMode === "all_dates" && date < options.startDate) continue;
    byDate.set(date, [...(byDate.get(date) ?? []), period.id]);
  }
  const sessions = [...byDate.entries()]
    .map(([date, periodIds]) => ({ date, periodIds }))
    .sort((a, b) => b.date.localeCompare(a.date));
  return options.cleanupMode === "all_dates"
    ? sessions.reverse()
    : sessions.slice(0, options.sessionCount).reverse();
}

// The report's sessions, plus the dates of any nobody checked in to (e.g. a
// break week whose Planning Center session still exists). Those weeks stay
// in the report -- the weekly bar chart shows them as "0 (week off)" so a
// reviewer can see the week was off (Andrew, 2026-10-14) -- but the cleanup
// scripts and report engines leave weeks with no attendance out of
// attendance rates. An empty week still counts as one of the last N weeks.
export function pickHeldSessions(
  periods: Resource[],
  checkIns: Resource[],
  options: Parameters<typeof pickSessions>[1],
): { sessions: PickedSession[]; skippedDates: string[] } {
  const periodsWithCheckIns = new Set(checkIns.map((checkIn) => relId(checkIn, "event_period")).filter(Boolean));
  const sessions = pickSessions(periods, options);
  const skippedDates = sessions
    .filter((session) => !session.periodIds.some((id) => periodsWithCheckIns.has(id)))
    .map((session) => session.date);
  return { sessions, skippedDates };
}

// Who counts as a first-timer in this report. Planning Center's "first time"
// flag is per event, so when events are joined into one report, or another
// event's check-ins are copied into a week (week substitutions), someone new
// to the OTHER event was showing up as a first-timer even though they'd
// attended this one for months (Andrew, 2026-10-14). Now a person is a
// first-timer only if one of their check-ins in the report is flagged first
// time AND they have no earlier check-in anywhere in the report's events
// (whose full history prepare already loads).
export function reportFirstTimers(data: EventData, inRange: Resource[]): Set<string> {
  const firstTimeIds = new Set(data.firstTime.map((checkIn) => checkIn.id));
  const dateByPeriod = new Map(data.periods.map((period) => [period.id, startsAtOf(period).slice(0, 10)]));
  const dateOf = (checkIn: Resource): string => {
    const fromPeriod = dateByPeriod.get(relId(checkIn, "event_period"));
    if (fromPeriod) return fromPeriod;
    const created = checkIn.attributes?.created_at;
    return typeof created === "string" ? created.slice(0, 10) : "";
  };
  const earliest = new Map<string, string>();
  for (const checkIn of data.checkIns) {
    const person = relId(checkIn, "person");
    const date = dateOf(checkIn);
    if (!person || !date) continue;
    const current = earliest.get(person);
    if (!current || date < current) earliest.set(person, date);
  }
  const result = new Set<string>();
  for (const checkIn of inRange) {
    const attributes = checkIn.attributes ?? {};
    const flagged = firstTimeIds.has(checkIn.id) || attributes.first_time === true || attributes.first_time_in_event === true;
    if (!flagged) continue;
    const person = relId(checkIn, "person");
    const date = dateOf(checkIn);
    if (!person || !date) continue;
    if ((earliest.get(person) ?? date) >= date) result.add(person);
  }
  return result;
}
