import { test } from "node:test";
import assert from "node:assert/strict";
import { dueJobs, easternToUtc, normalizeSendTimes, slotKey } from "./jobSchedule";

test("the 15-minute tick finds fixed jobs at their Eastern times, summer and winter", () => {
  // Mon Oct 19 2026, 1:00 AM EDT = 05:00 UTC -> people sync
  assert.deepEqual(dueJobs(new Date("2026-10-19T05:00:00Z"), []).fixed, ["people_sync"]);
  // Mon Dec 14 2026, 1:00 AM EST = 06:00 UTC -> people sync (not at 05:00 UTC any more)
  assert.deepEqual(dueJobs(new Date("2026-12-14T06:00:00Z"), []).fixed, ["people_sync"]);
  assert.deepEqual(dueJobs(new Date("2026-12-14T05:00:00Z"), []).fixed, []);
  // Daily 8:00 AM scheduled reports, and nothing at 8:15
  assert.deepEqual(dueJobs(new Date("2026-12-01T13:00:00Z"), []).fixed, ["scheduled_reports"]);
  assert.deepEqual(dueJobs(new Date("2026-12-01T13:15:00Z"), []).fixed, []);
  // A tick a few seconds late still counts
  assert.deepEqual(dueJobs(new Date("2026-10-19T07:00:42Z"), []).fixed, ["wiki_drive_sync", "group_history_sync"]);
});

test("Weekly Pulse slots are matched in Eastern time", () => {
  const slots = ["1@07:00", "0@13:30"];
  assert.equal(dueJobs(new Date("2026-10-19T11:00:00Z"), slots).pulseSlot, "1@07:00"); // Mon 7:00 AM EDT
  assert.equal(dueJobs(new Date("2026-12-13T18:30:00Z"), slots).pulseSlot, "0@13:30"); // Sun 1:30 PM EST
  assert.equal(dueJobs(new Date("2026-12-13T17:30:00Z"), slots).pulseSlot, null);
  assert.equal(slotKey(3, 9, 44), "3@09:30");
});

test("send times are validated", () => {
  assert.deepEqual(
    normalizeSendTimes([{ weekday: 3, time: "09:00" }, { weekday: 1, time: "07:00" }, { weekday: 3, time: "09:00" }, { weekday: 7, time: "09:00" }, { weekday: 2, time: "09:10" }, null]),
    [{ weekday: 1, time: "07:00" }, { weekday: 3, time: "09:00" }],
  );
});

test("Eastern wall time to UTC across daylight saving", () => {
  assert.equal(easternToUtc("2026-10-19", 7, 0).toISOString(), "2026-10-19T11:00:00.000Z");
  assert.equal(easternToUtc("2026-11-02", 7, 0).toISOString(), "2026-11-02T12:00:00.000Z");
  assert.equal(easternToUtc("2027-03-15", 7, 0).toISOString(), "2027-03-15T11:00:00.000Z");
});
