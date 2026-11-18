import { test } from "node:test";
import assert from "node:assert/strict";
import { eventsChanged, mergeEventWeeks, type PulledWeek } from "./engagementSync";
import { itemEventIds, normalizeTrackedItems } from "./engagement";

const week = (weekStart: string, present: string[], firstTime: string[] = [], sessions = 1): PulledWeek => ({
  weekStart, sessions, present: new Set(present), roster: null, taken: true, firstTime: new Set(firstTime),
});

test("mergeEventWeeks unions people and adds sessions per week", () => {
  const merged = mergeEventWeeks([
    [week("2026-11-02", ["1", "2"], ["2"]), week("2026-11-09", ["1"])],
    [week("2026-11-02", ["2", "3"], ["3"], 2)],
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual([...merged[0].present].sort(), ["1", "2", "3"]);
  assert.deepEqual([...merged[0].firstTime].sort(), ["2", "3"]);
  assert.equal(merged[0].sessions, 3);
  assert.equal(merged[1].weekStart, "2026-11-09");
});

test("eventsChanged: an old single-event item is unchanged; adding or removing events is a change", () => {
  assert.equal(eventsChanged(undefined, ["10"]), false);
  assert.equal(eventsChanged(undefined, ["10", "11"]), true);
  assert.equal(eventsChanged(["10", "11"], ["11", "10"]), false);
  assert.equal(eventsChanged(["10", "11"], ["10"]), true);
});

test("normalizeTrackedItems keeps combined Check-Ins events, drops duplicates and non-event kinds", () => {
  const [combined, group] = normalizeTrackedItems([
    { kind: "checkins_event", id: "10", name: "TC College", role: "tc_college", extraEvents: [{ id: "11", name: "TC College 2025" }, { id: "10" }, { id: "11" }, { id: "x" }] },
    { kind: "group", id: "5", name: "G", extraEvents: [{ id: "6", name: "nope" }] },
  ]);
  assert.deepEqual(combined.extraEvents, [{ id: "11", name: "TC College 2025" }]);
  assert.deepEqual(itemEventIds(combined), ["10", "11"]);
  assert.equal(group.extraEvents, undefined);
  assert.deepEqual(itemEventIds(group), ["5"]);
});
