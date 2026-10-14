import { test } from "node:test";
import assert from "node:assert/strict";
import { dueSchedules, nextRunDate, parseScheduleInput, type ReportSchedule } from "./reportSchedules";
import { parseReportRecipients } from "../routes/reports";

const schedule = (overrides: Partial<ReportSchedule>): ReportSchedule => ({
  id: "s1",
  name: "Youth monthly",
  templateId: 1,
  eventIds: ["823042"],
  eventNames: ["Transform YOUTH"],
  recipients: ["a@transformchurch.com"],
  frequency: "month",
  enabled: true,
  ownerUserId: "36862962",
  ownerName: "Andrew",
  createdAt: "2026-10-14T00:00:00Z",
  lastRun: null,
  ...overrides,
});

test("on Oct 1 both monthly and quarterly schedules are due, covering September and Q3", () => {
  const due = dueSchedules([
    schedule({ id: "m" }),
    schedule({ id: "q", frequency: "quarter" }),
    schedule({ id: "w", frequency: "week" }),
    schedule({ id: "off", enabled: false }),
  ], "2026-10-01");
  assert.deepEqual(due.map((entry) => [entry.schedule.id, entry.period.startDate, entry.period.endDate]), [
    ["m", "2026-09-01", "2026-09-30"],
    ["q", "2026-07-01", "2026-09-30"],
  ]);
});

test("a report already sent for the period isn't sent again", () => {
  const sent = schedule({ lastRun: { at: "x", trigger: "scheduled", periodStart: "2026-09-01", periodEnd: "2026-09-30", periodLabel: "September 2026", status: "sent" } });
  assert.equal(dueSchedules([sent], "2026-10-01").length, 0);
  const failed = schedule({ lastRun: { ...sent.lastRun!, status: "error" } });
  assert.equal(dueSchedules([failed], "2026-10-01").length, 1); // a failure is retried by the second trigger
  const manual = schedule({ lastRun: { ...sent.lastRun!, trigger: "manual" } });
  assert.equal(dueSchedules([manual], "2026-10-01").length, 1); // a test run doesn't cancel the real one
});

test("next run dates", () => {
  assert.equal(nextRunDate("month", "2026-10-14"), "2026-11-01");
  assert.equal(nextRunDate("quarter", "2026-10-14"), "2027-01-01");
  assert.equal(nextRunDate("week", "2026-10-14"), "2026-10-19");
  assert.equal(nextRunDate("month", "2026-11-01", true), "2026-11-01");
  assert.equal(nextRunDate("month", "2026-11-01"), "2026-12-01");
});

test("schedule input is validated", () => {
  const ok = parseScheduleInput({ name: " Kids ", templateId: "3", eventIds: ["1", "1", "abc"], recipients: "A@x.org, b@x.org", frequency: "quarter" }, parseReportRecipients);
  assert.ok("value" in ok);
  if ("value" in ok) {
    assert.equal(ok.value.name, "Kids");
    assert.deepEqual(ok.value.eventIds, ["1"]);
    assert.deepEqual(ok.value.recipients, ["a@x.org", "b@x.org"]);
    assert.equal(ok.value.enabled, true);
  }
  assert.deepEqual(parseScheduleInput({ name: "x", templateId: 1, eventIds: ["1"], recipients: "a@x.org", frequency: "daily" }, parseReportRecipients), { error: "Pick how often it runs." });
  assert.ok("error" in parseScheduleInput({ name: "x", templateId: 1, eventIds: ["1"], recipients: "nope", frequency: "week" }, parseReportRecipients));
});
