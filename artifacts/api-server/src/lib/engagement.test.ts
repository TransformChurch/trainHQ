import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POINTS,
  engagementScore,
  normalizePoints,
  normalizeSettings,
  normalizeTiers,
  normalizeTrackedItems,
  NO_FLAGS,
  parseFieldDate,
  partAvailability,
  personFlags,
  resolveFieldKeys,
  summarizeEngagement,
  totalPoints,
  yesLike,
  type PartAvailability,
} from "./engagement";
import { combinedMetrics, groupFirstTimers, personRates, trendSeries, windowMetrics, windowWeeks } from "./engagementMetrics";
import { syncFrom } from "./engagementSync";
import { tallySubmissions } from "./engagementForms";

const KEYS = { thrive: "field:1", serveClass: "field:2", lastServed: "field:3", giving: "field:4", leadership: "field:5" };
const ALL: PartAvailability = { formThrive: true, transform: true, serving: true, tcCollege: true, giving: true, leadership: true, serveClass: true };
const CONTEXT = { flags: new Map(), points: DEFAULT_POINTS, available: ALL };

test("default points total 17: form/thrive 1, transform 2, serving 3, TC College 3, giving 4, leadership 4", () => {
  assert.equal(totalPoints(DEFAULT_POINTS), 17);
  assert.equal(DEFAULT_POINTS.serveClass, 0);
  assert.deepEqual(normalizePoints({ transform: 5, giving: -2, leadership: "x", serving: 99 }),
    { ...DEFAULT_POINTS, transform: 5, giving: 0, serving: 20 });
});

test("score = points earned out of the total; parts with no data are scaled out", () => {
  const full = { formThrive: 1, transform: 1, serving: 1, tcCollege: 1, giving: 1, leadership: 1, serveClass: 0 };
  assert.equal(engagementScore(full, DEFAULT_POINTS), 17);
  const some = { formThrive: 1, transform: 0.5, serving: 0, tcCollege: 1, giving: 0, leadership: 0, serveClass: null };
  assert.equal(engagementScore(some, DEFAULT_POINTS), 5); // 1 + 1 + 3
  // Giving and Leadership not set up: 5 of 9 available points, scaled to 17.
  const noGivingLeader = { ...some, giving: null, leadership: null };
  assert.equal(engagementScore(noGivingLeader, DEFAULT_POINTS), Math.round((5 / 9) * 17 * 10) / 10);
  assert.equal(engagementScore({ formThrive: null, transform: null, serving: null, tcCollege: null, giving: null, leadership: null, serveClass: null }, DEFAULT_POINTS), null);
});

test("tiers are points and must fit under the total", () => {
  assert.deepEqual(normalizeTiers({ green: 12, yellow: 7 }, 17), { green: 12, yellow: 7 });
  assert.deepEqual(normalizeTiers({ green: 70, yellow: 40 }, 17), { green: 12, yellow: 7 }); // old 0-100 values
  assert.deepEqual(normalizeTiers({ green: 6, yellow: 8 }, 17), { green: 12, yellow: 7 });
  assert.deepEqual(normalizeTiers({}, 10), { green: 7, yellow: 4 });
  assert.deepEqual(normalizeSettings({ tiers: { green: 70, yellow: 40 }, weights: { attendance: 5 } }).tiers, { green: 12, yellow: 7 });
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

test("person flags: serving within the window; giving and leadership from their fields", () => {
  const fields = { "field:1": "08/23/2026", "field:3": "08/01/2026", "field:5": "Yes" };
  assert.deepEqual(personFlags(fields, KEYS, "2026-10-27"),
    { ...NO_FLAGS, thrive: true, serving: true, leadership: true });
  assert.equal(personFlags({ "field:4": "Yes" }, KEYS, "2026-10-27").giving, true);
  assert.equal(personFlags({ "field:4": "Yes" }, { ...KEYS, giving: null }, "2026-10-27").giving, false);
  assert.equal(personFlags(fields, KEYS, "2026-11-15").serving, false); // 106 days later
  assert.equal(personFlags(fields, KEYS, "2026-11-15", 120).serving, true);
  assert.equal(personFlags({ "field:3": "12/01/2026" }, KEYS, "2026-10-27").serving, false); // future date
});

test("summarizeEngagement: shares per part, form OR thrive, missing set-ups left out", () => {
  const flags = new Map([
    ["a", { ...NO_FLAGS, thrive: true, serving: true, giving: true, tcCollege: true }],
    ["b", { ...NO_FLAGS, form: true, leadership: true }],
  ]);
  const people = [{ personId: "a", attendanceRate: 1 }, { personId: "b", attendanceRate: 0.5 }, { personId: "c", attendanceRate: 0 }];
  const summary = summarizeEngagement(people, flags, DEFAULT_POINTS, ALL);
  assert.equal(summary.people, 3);
  assert.equal(summary.percentages.transform, 0.5);
  assert.equal(summary.percentages.formThrive, 2 / 3);
  assert.equal(summary.percentages.serving, 1 / 3);
  assert.equal(summary.percentages.tcCollege, 1 / 3);
  assert.equal(summary.percentages.giving, 1 / 3);
  assert.equal(summary.percentages.leadership, 1 / 3);
  // 2/3*1 + .5*2 + 1/3*3 + 1/3*3 + 1/3*4 + 1/3*4 = 6.33
  assert.equal(summary.score, 6.3);
  const noLeader = summarizeEngagement(people, flags, DEFAULT_POINTS, { ...ALL, leadership: false, tcCollege: false });
  assert.equal(noLeader.percentages.leadership, null);
  assert.equal(noLeader.percentages.tcCollege, null);
  assert.equal(noLeader.score, Math.round(((2 / 3 + 1 + 1 + 4 / 3) / 10) * 17 * 10) / 10);
  assert.deepEqual(partAvailability({ ...KEYS, giving: null, leadership: null, serveClass: null }, false),
    { formThrive: true, transform: true, serving: true, tcCollege: false, giving: false, leadership: false, serveClass: false });
});

test("field keys: saved choice if still synced, else matched by label (never for giving / leadership)", () => {
  const synced = [
    { key: "field:700347", label: "Thrive" },
    { key: "field:1036232", label: "Serve Class Completed" },
    { key: "field:664891", label: "Last Served" },
  ];
  assert.deepEqual(resolveFieldKeys({}, synced), { thrive: "field:700347", serveClass: "field:1036232", lastServed: "field:664891", giving: null, leadership: null });
  assert.equal(resolveFieldKeys({}, [...synced, { key: "field:5", label: "Giving" }, { key: "field:6", label: "Leader" }]).leadership, null);
  assert.equal(resolveFieldKeys({ giving: "field:5" }, [...synced, { key: "field:5", label: "Regular giver" }]).giving, "field:5");
  assert.equal(resolveFieldKeys({ leadership: "field:6" }, [...synced, { key: "field:6", label: "Leader" }]).leadership, "field:6");
  assert.equal(resolveFieldKeys({ giving: "field:5" }, synced).giving, null);
  assert.deepEqual(resolveFieldKeys({ thrive: "field:999" }, synced).thrive, "field:700347");
});

test("settings normalize items (with roles), weeks, serving window and excluded forms", () => {
  const settings = normalizeSettings({
    servingWindowDays: 3,
    excludedFormIds: ["684768", "684768", "x"],
    dashboard: {
      defaultWeeks: 5,
      items: [
        { kind: "group_type", id: "12", name: "Young Adults" },
        { kind: "group_type", id: "12", name: "dupe" },
        { kind: "checkins_event", id: "77", name: "TC College", role: "tc_college" },
        { kind: "bogus", id: "1" },
        { kind: "checkins_event", id: "abc" },
      ],
    },
  });
  assert.equal(settings.servingWindowDays, 90);
  assert.equal(settings.dashboard.defaultWeeks, 8);
  assert.deepEqual(settings.excludedFormIds, ["684768"]);
  assert.deepEqual(settings.dashboard.items, [
    { kind: "group_type", id: "12", name: "Young Adults", role: "transform" },
    { kind: "checkins_event", id: "77", name: "TC College", role: "tc_college" },
  ]);
  assert.equal(normalizeTrackedItems([{ kind: "group", id: "7" }])[0].name, "7");
});

test("form submissions tally per person, only after the last sync", () => {
  const tally = tallySubmissions([
    { personId: "a", createdAt: "2026-10-01T10:00:00Z" },
    { personId: "a", createdAt: "2026-11-02T10:00:00Z" },
    { personId: "b", createdAt: "2026-09-01T10:00:00Z" },
    { personId: "", createdAt: "2026-11-02T10:00:00Z" },
  ], "2026-10-15T00:00:00Z");
  assert.deepEqual([...tally.entries()], [["a", { lastSubmittedAt: "2026-11-02T10:00:00Z", submissions: 1 }]]);
  assert.equal(tallySubmissions([{ personId: "b", createdAt: "2026-09-01T10:00:00Z" }, { personId: "b", createdAt: "2026-09-05T10:00:00Z" }], null).get("b")!.submissions, 2);
  // Same moment written two ways isn't counted twice.
  assert.equal(tallySubmissions([{ personId: "c", createdAt: "2026-10-27T17:00:00Z" }], "2026-10-27T17:00:00.000Z").size, 0);
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
  const metrics = windowMetrics(rows, presence, weeks, CONTEXT);
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

  const combined = combinedMetrics([{ weekRows: rows, presence }, { weekRows: rows, presence }], weeks, CONTEXT);
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
