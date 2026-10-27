import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRunLocations, runMetaWithLocations, summarizeLocations, zip5 } from "./reportLocations";

test("zip5 normalizes ZIP codes and rejects junk", () => {
  assert.equal(zip5("07070"), "07070");
  assert.equal(zip5("07070-1234"), "07070");
  assert.equal(zip5(" 07071 "), "07071");
  assert.equal(zip5("7070"), "07070");
  assert.equal(zip5("070701234"), "07070");
  assert.equal(zip5(""), null);
  assert.equal(zip5(null), null);
  assert.equal(zip5("NJ"), null);
  assert.equal(zip5("123"), null);
});

test("summarizeLocations counts each person once per ZIP; the rest are no address", () => {
  const zips = new Map<string, unknown>([["1", "07070"], ["2", "07070-0001"], ["3", "07071"], ["4", ""], ["5", null]]);
  const result = summarizeLocations(["1", "2", "3", "4", "5", "6", "1"], 8, zips);
  assert.deepEqual(result.zips, { "07070": 2, "07071": 1 });
  // 8 people in the report, 3 with a usable ZIP (one person had no id at all).
  assert.equal(result.noZip, 5);
  assert.equal(result.total, 8);
});

test("locations ride along in run meta without disturbing season fields", () => {
  const locations = { zips: { "07070": 3 }, noZip: 1, total: 4 };
  const season = { source: "checkins", sourceName: "YA", seasonLabel: "Fall 2026", startDate: "2026-09-01", endDate: "2026-11-30", weekLabels: {} };
  const raw = runMetaWithLocations(season, locations)!;
  assert.equal(JSON.parse(raw).seasonLabel, "Fall 2026");
  assert.deepEqual(parseRunLocations(raw), locations);
  assert.deepEqual(parseRunLocations(runMetaWithLocations(null, locations)), locations);
  assert.equal(runMetaWithLocations(null, null), null);
  assert.equal(parseRunLocations(JSON.stringify(season)), null);
  assert.equal(parseRunLocations("not json"), null);
  assert.deepEqual(parseRunLocations(JSON.stringify({ locations: { zips: { "07070": 2, bad: 3, "07071": -1 }, noZip: "2", total: 4 } })),
    { zips: { "07070": 2 }, noZip: 2, total: 4 });
});
