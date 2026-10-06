import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHistoryCsv, groupPeriodsByWeek, summarizeCheckIns, weekStartFor } from "./attendanceHistory";
import { computeWeekRange } from "./weeklyPulse";

test("weekStartFor uses the same Monday-UTC weeks as the Weekly Pulse", () => {
  assert.equal(weekStartFor("2026-10-04T13:00:00Z"), "2026-09-28"); // Sunday service
  assert.equal(weekStartFor("2026-09-28T00:00:00Z"), "2026-09-28"); // Monday midnight
  assert.equal(weekStartFor("2024-01-07T15:00:00Z"), "2024-01-01");
  // A Sunday service falls in the window the Monday cron reports on.
  const pulseWeek = computeWeekRange(new Date("2026-10-05T11:00:00Z"));
  assert.equal(pulseWeek.start.slice(0, 10), weekStartFor("2026-10-04T13:00:00Z"));
});

test("groupPeriodsByWeek bins sessions, oldest first, and drops out-of-range ones", () => {
  const weeks = groupPeriodsByWeek(
    [
      { id: "5", startsAt: "2024-01-14T15:00:00Z" },
      { id: "4", startsAt: "2024-01-14T13:00:00Z" },
      { id: "3", startsAt: "2024-01-07T13:00:00Z" },
      { id: "2", startsAt: "2023-12-31T13:00:00Z" }, // before since
      { id: "9", startsAt: "2030-01-06T13:00:00Z" }, // future
    ],
    "2024-01-01",
    new Date("2026-10-06T00:00:00Z"),
  );
  assert.deepEqual(weeks, [
    { weekStart: "2024-01-01", weekEnd: "2024-01-08", periodIds: ["3"] },
    { weekStart: "2024-01-08", weekEnd: "2024-01-15", periodIds: ["5", "4"] },
  ]);
});

test("summarizeCheckIns counts a person once across sessions", () => {
  const checkIn = (person: string) => ({ id: Math.random().toString(), type: "CheckIn", relationships: { person: { data: { id: person } } } });
  assert.deepEqual(summarizeCheckIns([checkIn("1"), checkIn("2"), checkIn("1")] as any), { uniqueAttendees: 2, totalCheckIns: 3 });
});

test("history CSV has one row per event-week", () => {
  const csv = buildHistoryCsv([{
    eventName: "TC Kids, Sundays", eventId: "7", eventArchived: true, weekStart: "2024-01-01", weekEnd: "2024-01-08",
    uniqueAttendees: 180, totalCheckIns: 190, sessions: 2,
  }]);
  assert.equal(csv, 'Event,Event ID,Archived,Week start (Mon),Week end,Unique attendees,Total check-ins,Sessions\r\n"TC Kids, Sundays",7,Yes,2024-01-01,2024-01-08,180,190,2\r\n');
});
