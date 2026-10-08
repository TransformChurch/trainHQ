import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGroupHistoryCsv, groupMeetingsByWeek, summarizeGroupAttendance } from "./groupHistory";

test("groupMeetingsByWeek bins meetings by Monday week and skips canceled/out-of-range ones", () => {
  const weeks = groupMeetingsByWeek(
    [
      { id: "3", startsAt: "2024-01-10T23:30:00Z", canceled: false }, // Wed, week of 1/8
      { id: "2", startsAt: "2024-01-08T23:30:00Z", canceled: false }, // Mon, week of 1/8
      { id: "1", startsAt: "2024-01-03T23:30:00Z", canceled: true },  // canceled
      { id: "0", startsAt: "2023-12-27T23:30:00Z", canceled: false }, // before since
      { id: "9", startsAt: "2031-01-01T23:30:00Z", canceled: false }, // future
    ],
    "2024-01-01",
    new Date("2026-10-06T00:00:00Z"),
  );
  assert.deepEqual(weeks, [{ weekStart: "2024-01-08", weekEnd: "2024-01-15", meetingIds: ["3", "2"] }]);
});

test("summarizeGroupAttendance counts unique people marked present; no records means not taken", () => {
  const rec = (person: string, attended?: boolean) => ({
    id: Math.random().toString(), type: "Attendance",
    attributes: attended === undefined ? {} : { attended },
    relationships: { person: { data: { id: person } } },
  });
  assert.deepEqual(summarizeGroupAttendance([rec("1", true), rec("2", false), rec("1", true), rec("3")] as any), {
    attendees: 2, attendanceRecords: 4,
  });
  assert.deepEqual(summarizeGroupAttendance([]), { attendees: null, attendanceRecords: 0 });
});

test("group history CSV marks weeks where attendance wasn't taken", () => {
  const csv = buildGroupHistoryCsv([
    { groupName: "Fall 2026: James - Olive", groupId: "5", groupArchived: false, weekStart: "2026-09-07", weekEnd: "2026-09-14", meetings: 1, attendees: 12, attendanceRecords: 15 },
    { groupName: "=bad", groupId: "6", groupArchived: true, weekStart: "2026-09-07", weekEnd: "2026-09-14", meetings: 1, attendees: null, attendanceRecords: 0 },
  ]);
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines[1], "Fall 2026: James - Olive,5,No,2026-09-07,2026-09-14,1,12,Yes");
  assert.equal(lines[2], "'=bad,6,Yes,2026-09-07,2026-09-14,1,,No");
});

import { groupActiveInRange, weeksToSync } from "./groupHistory";

test("groupActiveInRange skips groups created after or archived before the timeframe", () => {
  const range = ["2025-01-01", "2025-04-01"] as const;
  assert.equal(groupActiveInRange({ createdAt: "2024-08-01T00:00:00Z", archivedAt: null }, ...range), true);
  assert.equal(groupActiveInRange({ createdAt: "2025-05-01T00:00:00Z", archivedAt: null }, ...range), false); // created later
  assert.equal(groupActiveInRange({ createdAt: "2023-01-01T00:00:00Z", archivedAt: "2024-12-15T00:00:00Z" }, ...range), false); // archived before
  assert.equal(groupActiveInRange({ createdAt: "2023-01-01T00:00:00Z", archivedAt: "2025-02-10T00:00:00Z" }, ...range), true); // archived during
  assert.equal(groupActiveInRange({ createdAt: null, archivedAt: null }, ...range), true); // unknown dates never exclude
});

test("weeksToSync always refreshes recent weeks and fills older gaps only", () => {
  const week = (weekStart: string) => ({ weekStart, weekEnd: "", meetingIds: ["1"] });
  const weeks = [week("2026-08-10"), week("2026-08-17"), week("2026-09-21"), week("2026-09-28")];
  const saved = new Set(["2026-08-10", "2026-09-21", "2026-09-28"]);
  assert.deepEqual(weeksToSync(weeks, saved, "2026-09-21").map((w) => w.weekStart), ["2026-08-17", "2026-09-21", "2026-09-28"]);
  assert.deepEqual(weeksToSync(weeks, undefined, "2026-09-21").map((w) => w.weekStart), weeks.map((w) => w.weekStart));
});
