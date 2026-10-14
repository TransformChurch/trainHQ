import { test } from "node:test";
import assert from "node:assert/strict";
import { churchToday, defaultPeriodKind, dueFrequencies, previousPeriod } from "./reportPeriods";

test("previous month covers the whole calendar month, 4 or 5 weeks alike", () => {
  assert.deepEqual(previousPeriod("month", "2026-11-01"), { kind: "month", startDate: "2026-10-01", endDate: "2026-10-31", label: "October 2026" });
  assert.deepEqual(previousPeriod("month", "2026-03-15").endDate, "2026-02-28");
  assert.deepEqual(previousPeriod("month", "2028-03-01").endDate, "2028-02-29"); // leap year
  assert.deepEqual(previousPeriod("month", "2027-01-01"), { kind: "month", startDate: "2026-12-01", endDate: "2026-12-31", label: "December 2026" });
});

test("previous quarter", () => {
  assert.deepEqual(previousPeriod("quarter", "2026-10-01"), { kind: "quarter", startDate: "2026-07-01", endDate: "2026-09-30", label: "Q3 2026" });
  assert.deepEqual(previousPeriod("quarter", "2027-01-01"), { kind: "quarter", startDate: "2026-10-01", endDate: "2026-12-31", label: "Q4 2026" });
  assert.deepEqual(previousPeriod("quarter", "2026-05-20").startDate, "2026-01-01");
});

test("previous week is Monday to Sunday", () => {
  assert.deepEqual(previousPeriod("week", "2026-10-19").startDate, "2026-10-12"); // a Monday
  assert.deepEqual(previousPeriod("week", "2026-10-19").endDate, "2026-10-18");
  assert.deepEqual(previousPeriod("week", "2026-10-14").startDate, "2026-10-05"); // a Wednesday
});

test("church time zone decides the date", () => {
  // 03:30 UTC on Nov 1 is still Oct 31 in New York.
  assert.equal(churchToday(new Date("2026-11-01T03:30:00Z")), "2026-10-31");
  assert.equal(churchToday(new Date("2026-11-01T12:00:00Z")), "2026-11-01");
});

test("which schedules are due", () => {
  assert.deepEqual(dueFrequencies("2026-10-01"), ["month", "quarter"]); // Thursday
  assert.deepEqual(dueFrequencies("2026-11-01"), ["month"]); // Sunday
  assert.deepEqual(dueFrequencies("2027-03-01"), ["week", "month"]); // Monday
  assert.deepEqual(dueFrequencies("2026-10-19"), ["week"]);
  assert.deepEqual(dueFrequencies("2026-10-14"), []);
  assert.equal(defaultPeriodKind("kids_rutherford_quarterly"), "quarter");
  assert.equal(defaultPeriodKind("youth_monthly"), "month");
});

test("a 5-Friday month keeps all 5 sessions in range mode, 4-Friday template or not", async () => {
  const { pickSessions } = await import("./reportEvents");
  // Fridays from Aug 28 to Nov 6, 2026; October has 5 (2, 9, 16, 23, 30).
  const fridays = ["2026-08-28", "2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25", "2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30", "2026-11-06"];
  const periods = fridays.map((date, index) => ({ id: String(index + 1), attributes: { starts_at: `${date}T23:00:00Z` } }));
  const october = previousPeriod("month", "2026-11-01");
  const range = pickSessions(periods as never, { endDate: october.endDate, startDate: october.startDate, cleanupMode: "all_dates", sessionCount: 4 });
  assert.deepEqual(range.map((session) => session.date), ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"]);
  const september = previousPeriod("month", "2026-10-01");
  const sept = pickSessions(periods as never, { endDate: september.endDate, startDate: september.startDate, cleanupMode: "all_dates", sessionCount: 4 });
  assert.equal(sept.length, 4);
  // The old last-N behavior would have taken only 4 of October's 5.
  const lastFour = pickSessions(periods as never, { endDate: october.endDate, startDate: "", cleanupMode: "month_quarter", sessionCount: 4 });
  assert.equal(lastFour[0].date, "2026-10-09");
});
