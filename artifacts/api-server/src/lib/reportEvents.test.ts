import { test } from "node:test";
import assert from "node:assert/strict";
import { applyWeekCopy, mergeEventData, pickSessions, type EventData, type Resource } from "./reportEvents";
import { sumTrendRows } from "./checkinsHistory";

const period = (id: string, startsAt: string): Resource => ({ id, attributes: { starts_at: startsAt } });
const checkIn = (id: string, person: string, periodId: string): Resource => ({
  id,
  relationships: { person: { data: { id: person } }, event_period: { data: { id: periodId } } },
});
const person = (id: string, gender = "Male"): Resource => ({ id, attributes: { gender } });
const periodOf = (c: Resource) => c.relationships?.event_period?.data?.id;

// Youth normally meets Fridays; the week of Aug 17 2026 had a concert instead.
const youth: EventData = {
  eventId: "youth",
  eventName: "Transform YOUTH",
  periods: [period("y1", "2026-08-14T23:00:00Z"), period("y2", "2026-08-21T23:00:00Z")],
  checkIns: [checkIn("c1", "p1", "y1"), checkIn("c2", "p2", "y1"), checkIn("c3", "p1", "y2")],
  included: [person("p1"), person("p2")],
  firstTime: [],
};
const concert: EventData = {
  eventId: "concert",
  eventName: "Transform Youth Summer Finale Concert",
  periods: [period("k1", "2026-08-16T22:00:00Z"), period("k0", "2026-08-02T22:00:00Z")],
  checkIns: [checkIn("k-1", "p3", "k1"), checkIn("k-2", "p4", "k1"), checkIn("k-3", "p5", "k1"), checkIn("k-9", "p9", "k0")],
  included: [person("p3"), person("p4"), person("p5")],
  firstTime: [checkIn("kf-1", "p5", "k1")],
};

test("applyWeekCopy swaps the target's week for the source's check-ins", () => {
  // Week of Mon Aug 17 has no Youth session; the concert (Sun Aug 16, UTC Sun) belongs to the week of Aug 10.
  const copied = applyWeekCopy(youth, "2026-08-10", concert);
  // Youth's Aug 14 session is in the Aug 10 week -> replaced by the concert's 3 check-ins.
  assert.deepEqual(copied.checkIns.map((c) => c.id).sort(), ["c3", "k-1", "k-2", "k-3"]);
  assert.ok(copied.checkIns.filter((c) => c.id.startsWith("k-")).every((c) => periodOf(c) === "y1"));
  assert.deepEqual(copied.periods.map((p) => p.id).sort(), ["y1", "y2"]);
  assert.deepEqual(copied.firstTime.map((c) => c.id), ["kf-1"]);
  assert.ok(copied.included.some((p) => p.id === "p5"));
});

test("applyWeekCopy adds a session when the target had none that week", () => {
  const copied = applyWeekCopy(youth, "2026-08-24", {
    ...concert,
    periods: [period("k2", "2026-08-26T22:00:00Z")],
    checkIns: [checkIn("k-7", "p7", "k2")],
  });
  assert.equal(copied.periods.length, 3);
  const added = copied.periods.find((p) => p.id.startsWith("copy-"));
  assert.equal(added?.attributes?.starts_at, "2026-08-26T22:00:00Z");
  assert.equal(periodOf(copied.checkIns.find((c) => c.id === "k-7")!), added?.id);
});

test("applyWeekCopy leaves the target alone when the source has no session that week", () => {
  assert.equal(applyWeekCopy(youth, "2026-09-07", concert), youth);
});

test("mergeEventData pools events and pickSessions makes one column per date", () => {
  const a: EventData = { ...youth, eventId: "a", eventName: "A", periods: [period("a1", "2026-08-14T23:00:00Z")], checkIns: [], included: [], firstTime: [] };
  const b: EventData = { ...youth, eventId: "b", eventName: "B", periods: [period("b1", "2026-08-14T18:00:00Z"), period("b2", "2026-08-21T18:00:00Z")], checkIns: [], included: [], firstTime: [] };
  const merged = mergeEventData([a, b]);
  assert.equal(merged.eventId, "a,b");
  assert.equal(merged.eventName, "A + B");
  const sessions = pickSessions(merged.periods, { endDate: "2026-08-31", cleanupMode: "month_quarter", startDate: "", sessionCount: 5 });
  assert.deepEqual(sessions.map((s) => s.date), ["2026-08-14", "2026-08-21"]);
  assert.deepEqual(sessions[0].periodIds.sort(), ["a1", "b1"]);
});

test("pickSessions: newest N for month/quarter, date range for all dates", () => {
  const periods = ["2026-07-03", "2026-07-10", "2026-07-17", "2026-07-24"].map((d, i) => period(`p${i}`, `${d}T23:00:00Z`));
  assert.deepEqual(
    pickSessions(periods, { endDate: "2026-07-24", cleanupMode: "month_quarter", startDate: "", sessionCount: 2 }).map((s) => s.date),
    ["2026-07-17", "2026-07-24"],
  );
  assert.deepEqual(
    pickSessions(periods, { endDate: "2026-07-17", cleanupMode: "all_dates", startDate: "2026-07-10", sessionCount: 2 }).map((s) => s.date),
    ["2026-07-10", "2026-07-17"],
  );
});

test("sumTrendRows adds events week by week and keeps unknowns null", () => {
  const rows = sumTrendRows([
    [{ weekStart: "2026-08-10", total: 20, male: 10, female: 10, unknown: 0, firstTimers: 2, firstTimersReturned: null }],
    [
      { weekStart: "2026-08-10", total: 5, male: null, female: null, unknown: null, firstTimers: null, firstTimersReturned: null },
      { weekStart: "2026-08-17", total: 7, male: 3, female: 4, unknown: 0, firstTimers: 1, firstTimersReturned: 0 },
    ],
  ]);
  assert.deepEqual(rows[0], { weekStart: "2026-08-10", total: 25, male: 10, female: 10, unknown: 0, firstTimers: 2, firstTimersReturned: null });
  assert.equal(rows[1].total, 7);
});

test("weeks nobody checked in to stay in the report as 0 weeks and are listed", async () => {
  const { pickHeldSessions } = await import("./reportEvents");
  // September 2026 Fridays; Sept 11 had a session in Planning Center but no check-ins.
  const dates = ["2026-08-28", "2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"];
  const periods = dates.map((date, index) => ({ id: `p${index}`, attributes: { starts_at: `${date}T23:00:00Z` } }));
  const checkIns = periods
    .filter((period) => period.id !== "p2")
    .map((period, index) => ({ id: `c${index}`, relationships: { event_period: { data: { id: period.id } } } }));

  const month = { endDate: "2026-09-30", startDate: "2026-09-01", cleanupMode: "all_dates" as const, sessionCount: 4 };
  const september = pickHeldSessions(periods as never, checkIns as never, month);
  assert.deepEqual(september.skippedDates, ["2026-09-11"]);
  // The week off stays a column (shown as "0 (week off)"); the cleanup script leaves it out of rates.
  assert.deepEqual(september.sessions.map((session) => session.date), ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"]);

  // "Last 4 weeks": the empty week is one of the 4 -- no reaching back to Aug 28.
  const lastFour = { endDate: "2026-09-30", startDate: "", cleanupMode: "month_quarter" as const, sessionCount: 4 };
  const four = pickHeldSessions(periods as never, checkIns as never, lastFour);
  assert.deepEqual(four.sessions.map((session) => session.date), ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"]);
  assert.deepEqual(four.skippedDates, ["2026-09-11"]);

  // Nothing listed when every session had check-ins.
  const all = periods.map((period, index) => ({ id: `a${index}`, relationships: { event_period: { data: { id: period.id } } } }));
  assert.deepEqual(pickHeldSessions(periods as never, all as never, month).skippedDates, []);
});

test("first-timers are judged across all of the report's events", async () => {
  const { reportFirstTimers, applyWeekCopy: copyWeek, mergeEventData: merge } = await import("./reportEvents");
  const period = (id: string, date: string) => ({ id, attributes: { starts_at: `${date}T23:00:00Z` } });
  const checkIn = (id: string, periodId: string, person: string) => ({
    id, relationships: { event_period: { data: { id: periodId } }, person: { data: { id: person } } },
  });

  // Youth: "reg" has come every Friday since August; "new" first came 9/4.
  const youth = {
    eventId: "y", eventName: "Youth",
    periods: [period("y1", "2026-08-07"), period("y2", "2026-08-14"), period("y3", "2026-08-21"), period("y4", "2026-09-04")],
    checkIns: [checkIn("a", "y1", "reg"), checkIn("b", "y2", "reg"), checkIn("c", "y4", "reg"), checkIn("d", "y4", "new")],
    included: [],
    firstTime: [checkIn("a", "y1", "reg"), checkIn("d", "y4", "new")],
  };
  // Concert on 8/21 replaced Youth that week; "reg" was flagged first-time at the concert.
  const concert = {
    eventId: "c", eventName: "Concert",
    periods: [period("c1", "2026-08-21")],
    checkIns: [checkIn("x", "c1", "reg"), checkIn("z", "c1", "guest")],
    included: [],
    firstTime: [checkIn("x", "c1", "reg"), checkIn("z", "c1", "guest")],
  };

  // Week copy: concert check-ins copied into Youth's 8/21 week.
  const copied = copyWeek(youth as never, "2026-08-17", concert as never);
  const inRange = copied.checkIns.filter((entry) => ["y3", "y4"].includes(entry.relationships!.event_period!.data!.id!));
  const fromCopy = reportFirstTimers(copied, inRange);
  assert.equal(fromCopy.has("reg"), false); // regular, despite the concert's first-time flag
  assert.equal(fromCopy.has("guest"), true); // genuinely new to these events
  assert.equal(fromCopy.has("new"), true);

  // Joined events: same result.
  const joined = merge([youth as never, concert as never]);
  const joinedInRange = joined.checkIns.filter((entry) => ["y4", "c1"].includes(entry.relationships!.event_period!.data!.id!));
  const fromJoin = reportFirstTimers(joined, joinedInRange);
  assert.deepEqual([...fromJoin].sort(), ["guest", "new"]);
});
