import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WEIGHTS, normalizeSettings, normalizeTiers } from "./engagement";
import { windowWeeks } from "./engagementMetrics";
import { compareSnapshots, givingOverdue, scorePeople, tierFor } from "./engagementPeople";

const TIERS = { green: 70, yellow: 40 };

test("tiers: green >= green cutoff, yellow >= yellow cutoff, else red", () => {
  assert.equal(tierFor(70, TIERS), "green");
  assert.equal(tierFor(69, TIERS), "yellow");
  assert.equal(tierFor(40, TIERS), "yellow");
  assert.equal(tierFor(39, TIERS), "red");
  assert.equal(tierFor(null, TIERS), null);
  assert.deepEqual(normalizeTiers({ green: 80, yellow: 50 }), { green: 80, yellow: 50 });
  assert.deepEqual(normalizeTiers({ green: 40, yellow: 50 }), TIERS); // yellow must be below green
  assert.deepEqual(normalizeSettings({}).tiers, TIERS);
  assert.equal(normalizeSettings({}).missedGivingDays, 35);
  assert.equal(normalizeSettings({ missedGivingDays: 60 }).missedGivingDays, 60);
});

test("people are scored from their own attendance and flags; dropouts score 0 attendance", () => {
  const window = windowWeeks("2026-11-02", 4); // 10-12 .. 11-02
  const lookback = windowWeeks("2026-11-02", 26);
  const weekRows = window.map((weekStart) => ({ weekStart, sessions: 1, attendees: 5, firstTimers: 0 }));
  const presence = [
    ...window.map((weekStart) => ({ weekStart, personId: "regular" })),
    { weekStart: window[0], personId: "sometimes" },
    { weekStart: window[2], personId: "sometimes" },
    { weekStart: "2026-08-03", personId: "gone" }, // in lookback, not in window
  ];
  const flags = new Map([
    ["regular", { thrive: true, serveClass: true, serving: true, giving: true }],
    ["sometimes", { thrive: true, serveClass: false, serving: false, giving: false }],
  ]);
  const scores = new Map(scorePeople([{ key: "checkins_event:1", weekRows, presence }], window, lookback, flags, DEFAULT_WEIGHTS, false)
    .map((person) => [person.personId, person]));
  assert.equal(scores.get("regular")!.score, 100);
  assert.equal(scores.get("sometimes")!.attendance, 0.5);
  assert.equal(scores.get("sometimes")!.score, Math.round(((0.5 + 1) / 4) * 100));
  assert.equal(scores.get("gone")!.attendance, 0);
  assert.equal(scores.get("gone")!.score, 0);
  assert.deepEqual(scores.get("gone")!.items, ["checkins_event:1"]);
  // With a Giving field, giving counts as a fifth part.
  const withGiving = scorePeople([{ key: "x", weekRows, presence }], window, lookback, flags, DEFAULT_WEIGHTS, true);
  assert.equal(withGiving.find((person) => person.personId === "sometimes")!.score, Math.round(((0.5 + 1) / 5) * 100));
});

test("a summer break (no held weeks in the window) leaves attendance out", () => {
  const window = windowWeeks("2026-08-03", 4);
  const lookback = windowWeeks("2026-08-03", 26);
  const presence = [{ weekStart: "2026-05-04", personId: "a" }];
  const weekRows = [{ weekStart: "2026-05-04", sessions: 1, attendees: 3, firstTimers: 0 }];
  const flags = new Map([["a", { thrive: true, serveClass: true, serving: false, giving: false }]]);
  const [person] = scorePeople([{ key: "g", weekRows, presence }], window, lookback, flags, DEFAULT_WEIGHTS, false);
  assert.equal(person.attendance, null);
  assert.equal(person.score, 67); // thrive + serve class of 3 parts
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
