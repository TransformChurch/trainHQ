import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eventActiveInRange,
  findPending,
  masterEventIdsInRange,
  matchesTerms,
  normalizeState,
  resolvePending,
  splitMasterTokens,
  type CheckinMaster,
} from "./checkinMasters";
import { isLastDayOfMonth, dueJobs, lastEasternOccurrence } from "./jobSchedule";
import { masterHistoryRows } from "../routes/attendanceHistory";

const master = (overrides: Partial<CheckinMaster> = {}): CheckinMaster => ({
  id: "1", kind: "checkins", name: "Thrive Master", includeTerms: ["Thrive"], excludeTerms: ["Leader"],
  events: [{ id: "10", name: "Thrive Jan" }], pending: [], dismissedIds: [],
  createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", ...overrides,
});

test("matchesTerms: any include term, no exclude term, case-insensitive", () => {
  assert.equal(matchesTerms("THRIVE Class - Feb", ["thrive"], ["leader"]), true);
  assert.equal(matchesTerms("Thrive Leader Huddle", ["thrive"], ["leader"]), false);
  assert.equal(matchesTerms("Serve Class", ["thrive"], []), false);
  assert.equal(matchesTerms("Thrive", [], []), false);
});

test("findPending suggests only new matches, skipping members, pending and dismissed", () => {
  const state = normalizeState({ masters: [master({ pending: [{ id: "11", name: "Thrive Feb", foundAt: "x", archived: false }], dismissedIds: ["12"] })] });
  const found = findPending(state, [
    { id: "10", name: "Thrive Jan", archived: true },
    { id: "11", name: "Thrive Feb", archived: false },
    { id: "12", name: "Thrive Mar", archived: false },
    { id: "13", name: "Thrive Apr", archived: false },
    { id: "14", name: "Thrive Leader Night", archived: false },
  ], new Date("2026-11-30T12:00:00Z"));
  assert.deepEqual(found, [{ masterId: "1", masterName: "Thrive Master", kind: "checkins", events: [{ id: "13", name: "Thrive Apr" }] }]);
  assert.deepEqual(state.masters[0].pending.map((event) => event.id), ["11", "13"]);
});

test("resolvePending approves into events or dismisses for good", () => {
  const m = master({ pending: [{ id: "11", name: "A", foundAt: "", archived: false }, { id: "12", name: "B", foundAt: "", archived: false }] });
  assert.equal(resolvePending(m, ["11"], true), 1);
  assert.deepEqual(m.events.map((event) => event.id), ["10", "11"]);
  assert.equal(resolvePending(m, ["12"], false), 1);
  assert.deepEqual(m.dismissedIds, ["12"]);
  assert.equal(m.pending.length, 0);
  assert.equal(resolvePending(m, ["99"], true), 0);
});

test("masterEventIdsInRange keeps events that existed in the window", () => {
  const m = master({ events: [{ id: "1", name: "old" }, { id: "2", name: "now" }, { id: "3", name: "future" }, { id: "4", name: "unknown" }] });
  const dated = [
    { id: "1", createdAt: "2025-01-01T00:00:00Z", archivedAt: "2025-02-01T00:00:00Z" },
    { id: "2", createdAt: "2026-10-01T00:00:00Z", archivedAt: null },
    { id: "3", createdAt: "2027-01-05T00:00:00Z", archivedAt: null },
  ];
  assert.deepEqual(masterEventIdsInRange(m, dated, "2026-09-01", "2026-12-01"), ["2", "4"]);
  assert.equal(eventActiveInRange({ createdAt: null, archivedAt: null }, "2026-01-01", "2026-02-01"), true);
});

test("splitMasterTokens separates master:<id> tokens", () => {
  assert.deepEqual(splitMasterTokens(["5", "master:2", "master:x"]), { eventIds: ["5", "master:x"], masterIds: ["2"] });
});

test("the monthly search runs only on the last day of the month at 9 PM Eastern", () => {
  assert.equal(isLastDayOfMonth("2026-11-30"), true);
  assert.equal(isLastDayOfMonth("2026-11-29"), false);
  assert.equal(isLastDayOfMonth("2028-02-29"), true);
  // 2026-11-30 21:00 EST = 2026-12-01 02:00 UTC
  assert.ok(dueJobs(new Date("2026-12-01T02:00:00Z"), []).fixed.includes("checkin_masters_search"));
  assert.ok(!dueJobs(new Date("2026-11-30T02:00:00Z"), []).fixed.includes("checkin_masters_search"));
  const last = lastEasternOccurrence([{ weekday: null, hour: 21, minute: 0, monthDay: "last" }], new Date("2026-11-18T12:00:00Z"));
  assert.equal(last?.toISOString(), "2026-11-01T01:00:00.000Z"); // Oct 31 9 PM EDT
});

test("masterHistoryRows adds the master's events together per week", () => {
  const row = (eventId: string, weekStart: string, unique: number) => ({
    eventName: `E${eventId}`, eventId, eventArchived: false, weekStart, weekEnd: weekStart, uniqueAttendees: unique, totalCheckIns: unique, sessions: 1,
  });
  const rows = masterHistoryRows([{ id: "1", name: "Thrive", events: [{ id: "10" }, { id: "11" }] }], [
    row("10", "2026-11-02", 5), row("11", "2026-11-02", 3), row("11", "2026-11-09", 4), row("99", "2026-11-02", 50),
  ]);
  assert.deepEqual(rows.map((entry) => [entry.eventId, entry.weekStart, entry.uniqueAttendees, entry.sessions]), [
    ["master:1", "2026-11-02", 8, 2], ["master:1", "2026-11-09", 4, 1],
  ]);
});

test("group masters only search groups, Check-In masters only events", () => {
  const state = normalizeState({ masters: [master(), { ...master(), id: "2", kind: "groups", name: "Running Master", includeTerms: ["Running"], excludeTerms: [], events: [] }] });
  assert.equal(state.masters[1].kind, "groups");
  const groups = [{ id: "50", name: "Running Group Fall", archived: false }, { id: "51", name: "Thrive Group", archived: false }];
  const found = findPending(state, groups, new Date("2026-11-30T12:00:00Z"), "groups");
  assert.deepEqual(found.map((entry) => [entry.masterName, entry.events.map((event) => event.id)]), [["Running Master", ["50"]]]);
  assert.equal(state.masters[0].pending.length, 0);
});

test("groupMasterHistoryRows adds groups per week and keeps 'not taken' weeks blank", async () => {
  const { groupMasterHistoryRows } = await import("../routes/groupHistory");
  const row = (groupId: string, weekStart: string, attendees: number | null) => ({
    groupName: `G${groupId}`, groupId, groupArchived: false, weekStart, weekEnd: weekStart, meetings: 1, attendees, attendanceRecords: attendees ?? 0,
  });
  const rows = groupMasterHistoryRows([{ id: "2", name: "Running", events: [{ id: "50" }, { id: "51" }] }], [
    row("50", "2026-11-02", 6), row("51", "2026-11-02", 4), row("50", "2026-11-09", null),
  ]);
  assert.deepEqual(rows.map((entry) => [entry.groupId, entry.weekStart, entry.attendees, entry.meetings]), [
    ["master:2", "2026-11-02", 10, 2], ["master:2", "2026-11-09", null, 1],
  ]);
});
