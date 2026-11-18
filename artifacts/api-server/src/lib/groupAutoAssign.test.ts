import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectFieldValues,
  collectValuesByPerson,
  keywordMatchesValue,
  normalizeKeywords,
  planGroupSync,
  valuesMatchKeywords,
} from "./groupAutoAssign";

test("keywords match whole words inside a value, ignoring case and punctuation", () => {
  assert.equal(keywordMatchesValue("YTH", "Fearless YTH"), true);
  assert.equal(keywordMatchesValue("fearless yth", "Fearless  YTH"), true);
  assert.equal(keywordMatchesValue("Platform", "Platform"), true);
  assert.equal(keywordMatchesValue("Men", "Men's"), true);
  assert.equal(keywordMatchesValue("Men", "Women's"), false);
  assert.equal(keywordMatchesValue("Youth", "Young Adults"), false);
  assert.equal(keywordMatchesValue("AB Team", "AB Team"), true);
  assert.equal(keywordMatchesValue("Team AB", "AB Team"), false);
});

test("yes/true/checked are interchangeable for checkbox fields", () => {
  assert.equal(keywordMatchesValue("yes", "true"), true);
  assert.equal(keywordMatchesValue("Yes", "TRUE"), true);
  assert.equal(keywordMatchesValue("checked", "true"), true);
  assert.equal(keywordMatchesValue("yes", "false"), false);
  assert.equal(keywordMatchesValue("no", "false"), true);
  assert.equal(keywordMatchesValue("yes", "Yesenia"), false);
});

test("any value matching any keyword is enough", () => {
  assert.equal(valuesMatchKeywords(["AB Team", "Platform", "Thrive"], ["Youth", "Platform"]), true);
  assert.equal(valuesMatchKeywords(["AB Team", "Thrive"], ["Youth", "Platform"]), false);
  assert.equal(valuesMatchKeywords([], ["Youth"]), false);
  assert.equal(valuesMatchKeywords(["Youth"], []), false);
});

test("normalizeKeywords accepts lists or comma text and drops duplicates", () => {
  assert.deepEqual(normalizeKeywords(" Youth, fearless  yth ,\nYOUTH,, "), ["Youth", "fearless yth"]);
  assert.deepEqual(normalizeKeywords(["Platform", "", 3, "platform"]), ["Platform"]);
  assert.deepEqual(normalizeKeywords(null), []);
});

test("collectFieldValues keeps every value of a multi-option field", () => {
  const datum = (definition: string, value: string) => ({
    attributes: { value },
    relationships: { field_definition: { data: { id: definition } } },
  });
  const values = collectFieldValues([
    datum("279518", "AB Team"),
    datum("279518", "Platform"),
    datum("279518", "Thrive"),
    datum("1149241", "true"),
    datum("1149241", "  "),
  ]);
  assert.deepEqual(values.get("279518"), ["AB Team", "Platform", "Thrive"]);
  assert.deepEqual(values.get("1149241"), ["true"]);
});

test("collectValuesByPerson groups one field's data by person", () => {
  const datum = (person: string, value: string, type = "Person") => ({
    attributes: { value },
    relationships: { customizable: { data: { id: person, type } } },
  });
  const byPerson = collectValuesByPerson([
    datum("1", "AB Team"),
    datum("1", "Platform"),
    datum("2", "Youth"),
    datum("3", "Youth", "Household"),
  ]);
  assert.deepEqual(byPerson.get("1"), ["AB Team", "Platform"]);
  assert.deepEqual(byPerson.get("2"), ["Youth"]);
  assert.equal(byPerson.has("3"), false);
});

test("weekly sync adds new matches and removes only auto-added members who stopped matching", () => {
  const members = [
    { userId: "a", source: "auto" },   // still matches -> stays
    { userId: "b", source: "auto" },   // no longer matches -> removed
    { userId: "c", source: "manual" }, // never matched, added by hand -> stays
    { userId: "d", source: "manual" }, // matches, added by hand -> stays manual
  ];
  const plan = planGroupSync(["a", "d", "e"], members, true);
  assert.deepEqual(plan.add, ["e"]);
  assert.deepEqual(plan.remove, ["b"]);
  assert.equal(plan.alreadyMembers, 2);
});

test("weekly sync removes nobody when Planning Center returned no data", () => {
  const plan = planGroupSync([], [{ userId: "a", source: "auto" }], false);
  assert.deepEqual(plan, { add: [], remove: [], alreadyMembers: 0 });
});
