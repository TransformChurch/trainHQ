import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_POINTS, NO_FLAGS, normalizeSettings, normalizeTiers, type PartAvailability } from "./engagement";
import { windowWeeks } from "./engagementMetrics";
import { compareSnapshots, givingOverdue, scorePeople, tierFor } from "./engagementPeople";

const TIERS = { green: 12, yellow: 7 };
const ALL: PartAvailability = { formThrive: true, transform: true, serving: true, tcCollege: true, giving: true, leadership: true, serveClass: false };

test("tiers in points: green >= green cutoff, yellow >= yellow cutoff, else red", () => {
  assert.equal(tierFor(12, TIERS), "green");
  assert.equal(tierFor(11.9, TIERS), "yellow");
  assert.equal(tierFor(7, TIERS), "yellow");
  assert.equal(tierFor(6.9, TIERS), "red");
  assert.equal(tierFor(null, TIERS), null);
  assert.deepEqual(normalizeTiers({ green: 14, yellow: 9.5 }, 17), { green: 14, yellow: 9.5 });
  assert.deepEqual(normalizeSettings({}).tiers, TIERS);
  assert.equal(normalizeSettings({}).missedGivingDays, 35);
});

test("people are scored in points; Transform from Transform items only; TC College-only people get 0 Transform", () => {
  const window = windowWeeks("2026-11-02", 4); // 10-12 .. 11-02
  const lookback = windowWeeks("2026-11-02", 26);
  const weekRows = window.map((weekStart) => ({ weekStart, sessions: 1, attendees: 5, firstTimers: 0 }));
  const transform = {
    key: "group_type:1",
    role: "transform" as const,
    weekRows,
    presence: [
      ...window.map((weekStart) => ({ weekStart, personId: "regular" })),
      { weekStart: window[0], personId: "sometimes" },
      { weekStart: window[2], personId: "sometimes" },
      { weekStart: "2026-08-03", personId: "gone" }, // in lookback, not in window
    ],
  };
  const college = { key: "checkins_event:9", role: "tc_college" as const, weekRows, presence: [{ weekStart: window[1], personId: "student" }] };
  const flags = new Map([
    ["regular", { ...NO_FLAGS, thrive: true, serving: true, tcCollege: true, giving: true, leadership: true }],
    ["sometimes", { ...NO_FLAGS, form: true }],
    ["student", { ...NO_FLAGS, tcCollege: true }],
  ]);
  const scores = new Map(scorePeople([transform, college], window, lookback, { flags, points: DEFAULT_POINTS, available: ALL })
    .map((person) => [person.personId, person]));
  assert.equal(scores.get("regular")!.score, 17);
  assert.equal(scores.get("sometimes")!.attendance, 0.5);
  assert.equal(scores.get("sometimes")!.score, 2); // form 1 + half of transform 2
  assert.equal(scores.get("gone")!.attendance, 0);
  assert.equal(scores.get("gone")!.score, 0);
  assert.equal(scores.get("student")!.attendance, 0);
  assert.equal(scores.get("student")!.score, 3);
  assert.deepEqual(scores.get("student")!.items, ["checkins_event:9"]);
  // Leadership not set up: scaled to 17 from the 13 available points.
  const noLeader = scorePeople([transform], window, lookback, { flags, points: DEFAULT_POINTS, available: { ...ALL, leadership: false } });
  assert.equal(noLeader.find((person) => person.personId === "sometimes")!.score, Math.round((2 / 13) * 17 * 10) / 10);
});

test("a summer break (no Transform weeks held in the window) leaves Transform out", () => {
  const window = windowWeeks("2026-08-03", 4);
  const lookback = windowWeeks("2026-08-03", 26);
  const presence = [{ weekStart: "2026-05-04", personId: "a" }];
  const weekRows = [{ weekStart: "2026-05-04", sessions: 1, attendees: 3, firstTimers: 0 }];
  const flags = new Map([["a", { ...NO_FLAGS, thrive: true, serving: true }]]);
  const [person] = scorePeople([{ key: "g", weekRows, presence }], window, lookback, { flags, points: DEFAULT_POINTS, available: ALL });
  assert.equal(person.attendance, null);
  assert.equal(person.score, Math.round((4 / 15) * 17 * 10) / 10); // form/thrive 1 + serving 3 of 15
});

test("snapshot comparison flags tier drops and giving canceled / newly missed", () => {
  const row = (personId: string, score: number | null, tier: string | null, givingHas = false, givingDate: string | null = null) =>
    ({ personId, score, tier, givingHas, givingDate });
  const previous = [
    row("a", 75, "green"), row("b", 50, "yellow"), row("c", 80, "green"), row("d", 30, "red"),
    row("e", 60, "yellow"), row("g1", null, null, true, "2026-10-20"), row("g2", null, null, true, "2026-10-01"),
    row("g3", 72, "green", true, "2026-09-01"),
  ];
  const current = [
    row("a", 60, "yellow"), row("b", 30, "red"), row("c", 20, "red"), row("d", 45, "yellow"),
    row("e", 62, "yellow"), row("new", 10, "red"),
    row("g1", null, null, false, null), // field cleared -> canceled
    row("g2", null, null, true, "2026-10-01"), // date just went 35+ days old -> missed
    row("g3", 72, "green", true, "2026-09-01"), // already overdue last week -> no new flag
  ];
  const { drops, giving } = compareSnapshots(current, previous, "2026-11-02", "2026-10-26", 35);
  assert.deepEqual(drops.map((drop) => `${drop.personId}:${drop.from}>${drop.to}`), ["c:green>red", "b:yellow>red", "a:green>yellow"]);
  assert.deepEqual(giving.map((flag) => `${flag.personId}:${flag.kind}`), ["g1:canceled", "g2:missed"]);
  assert.equal(givingOverdue("2026-10-04", "2026-11-02", 35), false); // week ends 11-08; minus 35 days = 10-04
  assert.equal(givingOverdue("2026-10-03", "2026-11-02", 35), true);
  assert.equal(givingOverdue("2026-10-04", "2026-11-09", 35), true);
  assert.equal(givingOverdue(null, "2026-11-09", 35), false);
});
