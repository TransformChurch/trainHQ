import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WEIGHTS,
  engagementScore,
  normalizeSettings,
  normalizeTrackedItems,
  normalizeWeights,
  parseFieldDate,
  personFlags,
  resolveFieldKeys,
  summarizeEngagement,
  yesLike,
} from "./engagement";
import { combinedMetrics, groupFirstTimers, personRates, trendSeries, windowMetrics, windowWeeks } from "./engagementMetrics";
import { syncFrom } from "./engagementSync";

const KEYS = { thrive: "field:1", serveClass: "field:2", lastServed: "field:3" };

test("score is the weighted average of parts with data; giving (null) never counts", () => {
  const parts = { attendance: 0.8, thrive: 0.4, serveClass: 0.2, serving: 0.6, giving: null };
  assert.equal(engagementScore(parts, DEFAULT_WEIGHTS), 50);
  assert.equal(engagementScore(parts, { ...DEFAULT_WEIGHTS, attendance: 2 }), 56); // (1.6+.4+.2+.6)/5
  assert.equal(engagementScore(parts, { attendance: 0, thrive: 0, serveClass: 0, serving: 0, giving: 3 }), null);
  assert.equal(engagementScore({ attendance: null, thrive: null, serveClass: null, serving: null, giving: null }, DEFAULT_WEIGHTS), null);
});

test("weights are clamped to 0-10 and default to 1", () => {
  assert.deepEqual(normalizeWeights({ attendance: 3, thrive: -2, serveClass: "x", serving: 99 }),
    { attendance: 3, thrive: 0, serveClass: 1, serving: 10, giving: 1 });
});

test("yes-like values and field dates", () => {
  assert.equal(yesLike("10/05/2026"), true);
  assert.equal(yesLike("true"), true);
  assert.equal(yesLike("No"), false);
  assert.equal(yesLike(""), false);
  assert.equal(yesLike(null), false);
  assert.equal(parseFieldDate("7/4/2026"), "2026-07-04");
  assert.equal(parseFieldDate("2026-07-04T10:00:00Z"), "2026-07-04");
  assert.equal(parseFieldDate("soon"), null);
});

test("person flags: serving means Last Served within the window of asOf", () => {
  const fields = { "field:1": "08/23/2026", "field:3": "08/01/2026" };
  assert.deepEqual(personFlags(fields, KEYS, "2026-10-27"), { thrive: true, serveClass: false, serving: true });
  assert.equal(personFlags(fields, KEYS, "2026-11-15").serving, false); // 106 days later
  assert.equal(personFlags(fields, KEYS, "2026-11-15", 120).serving, true);
  assert.equal(personFlags({ "field:3": "12/01/2026" }, KEYS, "2026-10-27").serving, false); // future date
});

test("summarizeEngagement counts people without a profile as not yet", () => {
  const flags = new Map([
    ["a", { thrive: true, serveClass: true, serving: false }],
    ["b", { thrive: false, serveClass: true, serving: true }],
  ]);
  const summary = summarizeEngagement(
    [{ personId: "a", attendanceRate: 1 }, { personId: "b", attendanceRate: 0.5 }, { personId: "c", attendanceRate: 0 }],
    flags,
    DEFAULT_WEIGHTS,
  );
  assert.equal(summary.people, 3);
  assert.equal(summary.percentages.attendance, 0.5);
  assert.equal(summary.percentages.thrive, 1 / 3);
  assert.equal(summary.percentages.serveClass, 2 / 3);
  assert.equal(summary.score, Math.round(((0.5 + 1 / 3 + 2 / 3 + 1 / 3) / 4) * 100));
});

test("field keys: saved choice if still synced, else matched by label", () => {
  const synced = [
    { key: "field:700347", label: "Thrive" },
    { key: "field:1036232", label: "Serve Class Completed" },
    { key: "field:664891", label: "Last Served" },
  ];
  assert.deepEqual(resolveFieldKeys({}, synced), { thrive: "field:700347", serveClass: "field:1036232", lastServed: "field:664891" });
  assert.deepEqual(resolveFieldKeys({ thrive: "field:999" }, synced).thrive, "field:700347");
  assert.equal(resolveFieldKeys({}, []).serveClass, null);
});

test("settings normalize items, weeks and serving window", () => {
  const settings = normalizeSettings({
    servingWindowDays: 3,
    dashboard: {
      defaultWeeks: 5,
      items: [
        { kind: "group_type", id: "12", name: "Young Adults" },
        { kind: "group_type", id: "12", name: "dupe" },
        { kind: "bogus", id: "1" },
        { kind: "checkins_event", id: "abc" },
      ],
    },
  });
  assert.equal(settings.servingWindowDays, 90);
  assert.equal(settings.dashboard.defaultWeeks, 8);
  assert.deepEqual(settings.dashboard.items, [{ kind: "group_type", id: "12", name: "Young Adults" }]);
  assert.equal(normalizeTrackedItems([{ kind: "group", id: "7" }])[0].name, "7");
});

const weeks = windowWeeks("2026-10-19", 4); // 09-28, 10-05, 10-12, 10-19

test("window metrics: weeks off don't count; rates per person over held weeks", () => {
  assert.deepEqual(weeks, ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]);
  const rows = [
    { weekStart: "2026-09-28", sessions: 1, attendees: 2, firstTimers: 1 },
    { weekStart: "2026-10-05", sessions: 1, attendees: 0, firstTimers: 0 }, // week off
    { weekStart: "2026-10-12", sessions: 1, attendees: 1, firstTimers: 0 },
    { weekStart: "2026-10-19", sessions: 1, attendees: 3, firstTimers: 2 },
    { weekStart: "2026-09-21", sessions: 1, attendees: 9, firstTimers: 9 }, // outside the window
  ];
  const presence = [
    { weekStart: "2026-09-28", personId: "a" }, { weekStart: "2026-09-28", personId: "b" },
    { weekStart: "2026-10-12", personId: "a" },
    { weekStart: "2026-10-19", personId: "a" }, { weekStart: "2026-10-19", personId: "c" }, { weekStart: "2026-10-19", personId: "d" },
    { weekStart: "2026-09-21", personId: "z" },
  ];
  const rates = personRates(rows, presence, weeks);
  assert.equal(rates.get("a"), 1);
  assert.equal(rates.get("b"), 1 / 3);
  assert.equal(rates.has("z"), false);
  const metrics = windowMetrics(rows, presence, weeks, new Map(), DEFAULT_WEIGHTS);
  assert.equal(metrics.heldWeeks, 3);
  assert.equal(metrics.avgAttendance, 2);
  assert.equal(metrics.avgNewGuests, 1);
  assert.equal(metrics.uniqueAttendees, 4);
  assert.equal(metrics.attendanceRate, (1 + 1 / 3 + 1 / 3 + 1 / 3) / 4);

  const trend = trendSeries(rows, presence, "2026-10-19", 2, 3);
  assert.deepEqual(trend.map((point) => point.weekStart), ["2026-10-05", "2026-10-12", "2026-10-19"]);
  assert.equal(trend[0].newGuests, null); // week off
  assert.equal(trend[2].rollingAvgAttendance, 2); // weeks 10-12 (1) and 10-19 (3)
  // A rolling window reaching before the first saved week (09-21) stays empty.
  assert.equal(trendSeries(rows, presence, "2026-09-28", 3, 1)[0].rollingRate, null);
  assert.notEqual(trendSeries(rows, presence, "2026-09-28", 2, 1)[0].rollingRate, null);

  const combined = combinedMetrics([{ weekRows: rows, presence }, { weekRows: rows, presence }], weeks, new Map(), DEFAULT_WEIGHTS);
  assert.equal(combined.uniqueAttendees, 4);
  assert.equal(combined.avgAttendance, 4);
});

test("groups' new guests need 8 weeks of earlier history", () => {
  const earlier = windowWeeks("2026-10-12", 9);
  assert.deepEqual([...groupFirstTimers(earlier, new Set(["a"]), "2026-10-19", ["a", "b"])], ["b"]);
  assert.equal(groupFirstTimers(earlier.slice(-3), new Set(["a"]), "2026-10-19", ["a", "b"]).size, 0);
  assert.equal(groupFirstTimers([], new Set(), "2026-10-19", ["a"]).size, 0);
});

test("sync window: first run backfills 26 weeks, later runs refresh 3", () => {
  assert.equal(syncFrom(undefined, "2026-10-26"), "2026-04-27");
  assert.equal(syncFrom("2026-04-27", "2026-10-26"), "2026-10-05");
  assert.equal(syncFrom("2026-09-01", "2026-10-26"), "2026-04-27");
});
