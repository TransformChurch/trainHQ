import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGroupSeason,
  churchDateOf,
  defaultSeasonLabel,
  groupFirstTimers,
  meetingsInSeason,
  parseWeekLabels,
  type GroupMeeting,
  type GroupResource,
} from "./reportGroups";

const meeting = (id: string, startsAt: string, name = "", groupId = "g1", canceled = false): GroupMeeting =>
  ({ id, groupId, startsAt, name, canceled });
const record = (person: string, attended?: boolean): GroupResource => ({
  id: `${person}-${Math.random()}`,
  attributes: attended === undefined ? {} : { attended },
  relationships: { person: { data: { id: person } } },
});

test("churchDateOf puts a late-evening Eastern meeting on its local date", () => {
  assert.equal(churchDateOf("2026-01-16T00:30:00Z"), "2026-01-15"); // 7:30 PM EST
  assert.equal(churchDateOf("2026-06-18T23:00:00Z"), "2026-06-18"); // 7 PM EDT
});

test("meetingsInSeason keeps past, non-canceled meetings inside the range", () => {
  const now = new Date("2026-04-01T00:00:00Z");
  const all = [
    meeting("a", "2026-01-16T00:30:00Z"),
    meeting("b", "2026-01-23T00:30:00Z", "", "g1", true),
    meeting("c", "2026-03-20T00:30:00Z"),
    meeting("d", "2026-05-01T00:30:00Z"),
  ];
  assert.deepEqual(meetingsInSeason(all, "", "", now).map((m) => m.id), ["a", "c"]);
  assert.deepEqual(meetingsInSeason(all, "2026-01-16", "2026-03-31", now).map((m) => m.id), ["c"]);
});

test("buildGroupSeason counts present people per night and keeps empty nights as skipped", () => {
  const meetings = [
    meeting("m1", "2026-01-16T00:30:00Z", "Worship Night"),
    meeting("m2", "2026-01-23T00:30:00Z", "Sermon Discussion"),
    meeting("m3", "2026-01-30T00:30:00Z", "Panel"),
    meeting("x1", "2026-01-16T00:30:00Z", "Worship Night", "g2"),
  ];
  const season = buildGroupSeason(meetings, new Map([
    ["m1", [record("p1"), record("p2", false)]],
    ["x1", [record("p3", true)]],
    ["m2", [record("p1", false)]],
  ]));
  assert.deepEqual(season.serviceDates, ["2026-01-15", "2026-01-22", "2026-01-29"]);
  assert.deepEqual(season.skippedDates, ["2026-01-22", "2026-01-29"]);
  assert.deepEqual(season.notTakenDates, ["2026-01-29"]);
  assert.deepEqual([...season.presentByPerson.keys()].sort(), ["p1", "p3"]);
  assert.equal(season.presentRecords, 2);
  assert.equal(season.weekLabels["2026-01-15"], "Worship Night");
  assert.equal(season.weekLabels["2026-01-22"], "Sermon Discussion");
});

test("buildGroupSeason drops a night name when two groups called it different things", () => {
  const season = buildGroupSeason(
    [meeting("a", "2026-01-16T00:30:00Z", "Week 1"), meeting("b", "2026-01-16T00:30:00Z", "Kickoff", "g2")],
    new Map([["a", [record("p1")]]]),
  );
  assert.equal(season.weekLabels["2026-01-15"], undefined);
});

test("groupFirstTimers: new unless they were in another group before the season", () => {
  const result = groupFirstTimers(new Map([
    ["new", [{ groupId: "this", joinedAt: "2025-12-20T12:00:00Z" }]],
    ["returning", [{ groupId: "this", joinedAt: "2026-01-01T12:00:00Z" }, { groupId: "old", joinedAt: "2025-09-01T12:00:00Z" }]],
    ["joined-another-mid-season", [{ groupId: "other", joinedAt: "2026-02-01T12:00:00Z" }]],
  ]), new Set(["this"]), "2026-01-15");
  assert.deepEqual([...result].sort(), ["joined-another-mid-season", "new"]);
});

test("parseWeekLabels matches typed night names to report dates", () => {
  const dates = ["2026-01-15", "2026-01-22", "2026-03-05"];
  const { labels, unmatched } = parseWeekLabels(
    "1/15 Relationship Panel\n2026-01-22: Worship Night\n3/5/26 - Easter Weekend\n4/1 Nope\njust text",
    dates,
  );
  assert.deepEqual(labels, {
    "2026-01-15": "Relationship Panel",
    "2026-01-22": "Worship Night",
    "2026-03-05": "Easter Weekend",
  });
  assert.deepEqual(unmatched, ["4/1 Nope", "just text"]);
});

test("defaultSeasonLabel names the season from its first night", () => {
  assert.equal(defaultSeasonLabel("2026-01-15"), "Winter 2026");
  assert.equal(defaultSeasonLabel("2026-04-16"), "Spring 2026");
  assert.equal(defaultSeasonLabel("2026-07-09"), "Summer 2026");
  assert.equal(defaultSeasonLabel("2026-09-10"), "Fall 2026");
});

test("perGroupAttendance: each group's own held nights; roster includes absent members", async () => {
  const { perGroupAttendance } = await import("./reportGroups");
  const meetings = [
    { id: "m1", groupId: "A", startsAt: "2026-09-08T23:30:00Z", name: "A", canceled: false },
    { id: "m2", groupId: "A", startsAt: "2026-09-15T23:30:00Z", name: "A", canceled: false },
    { id: "m3", groupId: "B", startsAt: "2026-09-10T23:30:00Z", name: "B", canceled: false },
  ];
  const rec = (person: string, attended: boolean) => ({ id: `${person}${attended}`, attributes: { attended }, relationships: { person: { data: { id: person } } } });
  const attendance = new Map([
    ["m1", [rec("p1", true), rec("p2", true), rec("p3", false)]],
    ["m2", [rec("p1", true), rec("p2", false), rec("p3", false)]],
    ["m3", [rec("p1", true)]],
  ]);
  const [a, b] = perGroupAttendance(["A", "B"], meetings, attendance);
  assert.equal(a.heldNights, 2);
  assert.equal(a.roster, 3);
  assert.deepEqual(Object.fromEntries(a.people.map((p) => [p.personId, p.attendanceRate])), { p1: 1, p2: 0.5 });
  assert.deepEqual(b.people, [{ personId: "p1", attendanceRate: 1 }]);
});
