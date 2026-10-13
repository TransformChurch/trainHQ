import { test } from "node:test";
import assert from "node:assert/strict";
import { assessScheduledJob, autoSyncOutcome, lastExpectedFire, type ScheduledJobRecord } from "./scheduledJobs";

const record = (overrides: Partial<ScheduledJobRecord>): ScheduledJobRecord => ({
  lastAttemptAt: "2026-10-12T11:00:02.000Z",
  result: "ok",
  detail: null,
  finishedAt: "2026-10-12T11:03:00.000Z",
  lastOkAt: "2026-10-12T11:03:00.000Z",
  ...overrides,
});

test("lastExpectedFire finds the latest Monday slot", () => {
  // Tuesday 10/13 -> Monday 10/12 11:00 UTC
  assert.equal(lastExpectedFire("weekly_pulse", new Date("2026-10-13T15:00:00Z")).toISOString(), "2026-10-12T11:00:00.000Z");
  // Monday 10:59 -> previous Monday
  assert.equal(lastExpectedFire("weekly_pulse", new Date("2026-10-12T10:59:00Z")).toISOString(), "2026-10-05T11:00:00.000Z");
  // Exactly on time counts as this week
  assert.equal(lastExpectedFire("group_history_sync", new Date("2026-10-12T07:00:00Z")).toISOString(), "2026-10-12T07:00:00.000Z");
  // Daily job
  assert.equal(lastExpectedFire("wiki_drive_sync", new Date("2026-10-13T05:00:00Z")).toISOString(), "2026-10-12T06:00:00.000Z");
});

test("a run with no record after the grace period is missed", () => {
  const now = new Date("2026-10-13T15:00:00Z");
  const stale = record({ lastAttemptAt: "2026-10-05T11:00:01.000Z" });
  assert.equal(assessScheduledJob("weekly_pulse", stale, now).status, "missed");
  // Inside the grace window it's still just waiting.
  assert.equal(assessScheduledJob("weekly_pulse", stale, new Date("2026-10-12T11:10:00Z")).status, "ok");
  assert.equal(assessScheduledJob("weekly_pulse", null, now).status, "never");
});

test("results map to statuses", () => {
  const now = new Date("2026-10-13T15:00:00Z");
  assert.equal(assessScheduledJob("weekly_pulse", record({}), now).status, "ok");
  assert.equal(assessScheduledJob("weekly_pulse", record({ result: "rejected", detail: "secret" }), now).status, "failed");
  assert.equal(assessScheduledJob("weekly_pulse", record({ result: "partial" }), now).status, "warning");
  assert.equal(assessScheduledJob("weekly_pulse", record({ result: "running" }), now).status, "failed"); // never finished
  assert.equal(assessScheduledJob("weekly_pulse", record({ result: "running" }), new Date("2026-10-12T11:20:00Z")).status, "running");
});

test("autoSyncOutcome treats turned-off as skipped", () => {
  assert.equal(autoSyncOutcome({ status: "success", failures: [] }, "s").result, "ok");
  assert.equal(autoSyncOutcome({ status: "partial", failures: [{ error: "403" }] }, "s").result, "partial");
  assert.equal(autoSyncOutcome({ status: "error", failures: [], message: "Automatic sync is turned off." }, "s").result, "skipped");
  assert.equal(autoSyncOutcome({ status: "error", failures: [], message: "Token expired" }, "s").result, "error");
});
