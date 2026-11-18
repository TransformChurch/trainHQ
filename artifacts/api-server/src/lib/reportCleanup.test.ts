import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanupScriptArgs, isKidsEngine, KIDS_ENGINES, NO_GRADE_FLOOR_FLAG } from "./reportCleanup";

const SUPPORTING_SCRIPT = `ap.add_argument("${NO_GRADE_FLOOR_FLAG}", action="store_true")`;

test("Kids engines skip the grade floor", () => {
  for (const engine of KIDS_ENGINES) {
    assert.equal(isKidsEngine(engine), true);
    assert.deepEqual(cleanupScriptArgs(engine, SUPPORTING_SCRIPT), [NO_GRADE_FLOOR_FLAG]);
  }
});

test("Youth and season engines run the cleanup exactly as before", () => {
  for (const engine of ["youth_monthly", "youth_quarterly", "season_young_adults", "season_groups", "", null, undefined]) {
    assert.equal(isKidsEngine(engine), false);
    assert.deepEqual(cleanupScriptArgs(engine, SUPPORTING_SCRIPT), []);
  }
});

test("an uploaded script that doesn't know the flag isn't given it", () => {
  assert.deepEqual(cleanupScriptArgs("kids_rutherford", "import argparse  # older cleanup script"), []);
});
