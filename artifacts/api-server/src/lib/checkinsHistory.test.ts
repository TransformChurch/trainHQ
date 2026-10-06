import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWeeklyHistory, genderByPersonFromIncluded } from "./checkinsHistory";

const checkIn = (id: string, person: string, period: string) => ({
  id, relationships: { person: { data: { id: person } }, event_period: { data: { id: period } } },
});

test("buildWeeklyHistory bins check-ins by Monday week with a gender split", () => {
  const periods = new Map([
    ["p1", "2026-09-04T23:00:00Z"], // Fri, week of 8/31
    ["p2", "2026-09-11T23:00:00Z"], // Fri, week of 9/7
    ["p0", "2025-06-06T23:00:00Z"], // before sinceWeek
    ["p9", "2030-01-04T23:00:00Z"], // future
  ]);
  const genders = genderByPersonFromIncluded([
    { id: "a", attributes: { gender: "M" } },
    { id: "b", attributes: { gender: "Female" } },
    { id: "c", attributes: {} },
  ]);
  const rows = buildWeeklyHistory(
    [checkIn("1", "a", "p1"), checkIn("2", "b", "p1"), checkIn("3", "c", "p1"), checkIn("4", "a", "p2"), checkIn("5", "a", "p0")],
    periods,
    genders,
    "2025-10-06",
    new Date("2026-10-06T00:00:00Z"),
  );
  assert.deepEqual(rows, [
    { weekStart: "2026-08-31", weekEnd: "2026-09-07", sessions: 1, uniqueAttendees: 3, totalCheckIns: 3, maleAttendees: 1, femaleAttendees: 1, unknownGenderAttendees: 1, firstTimers: null, firstTimersReturned: null },
    { weekStart: "2026-09-07", weekEnd: "2026-09-14", sessions: 1, uniqueAttendees: 1, totalCheckIns: 1, maleAttendees: 1, femaleAttendees: 0, unknownGenderAttendees: 0, firstTimers: null, firstTimersReturned: null },
  ]);
});

test("first-timers are counted in the week of their first visit, and 'returned' means any later visit", () => {
  const periods = new Map([
    ["p1", "2026-09-04T23:00:00Z"], // week of 8/31
    ["p2", "2026-09-11T23:00:00Z"], // week of 9/7
    ["p3", "2026-09-18T23:00:00Z"], // week of 9/14
  ]);
  const attendee = [
    checkIn("1", "a", "p1"), checkIn("2", "b", "p1"), checkIn("3", "c", "p2"),
    checkIn("4", "a", "p3"),          // a came back two weeks later
  ];
  const firstTime = [checkIn("f1", "a", "p1"), checkIn("f2", "b", "p1"), checkIn("f3", "c", "p2")];
  const rows = buildWeeklyHistory(attendee, periods, undefined, "2026-01-05", new Date("2026-10-06T00:00:00Z"), firstTime);
  assert.deepEqual(rows.map((r) => [r.weekStart, r.firstTimers, r.firstTimersReturned]), [
    ["2026-08-31", 2, 1],
    ["2026-09-07", 1, 0],
    ["2026-09-14", 0, 0],
  ]);
});
