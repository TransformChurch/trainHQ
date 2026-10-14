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
