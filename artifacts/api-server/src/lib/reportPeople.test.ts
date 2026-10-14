import { test } from "node:test";
import assert from "node:assert/strict";
import type { PeopleProfile } from "@workspace/db";
import { planPeopleLookup, profileDiffersFromCheckIn, profileToAttributes, stripContactAttributes } from "./reportPeople";

const fields = [
  { key: "field:471476", label: "Baptized?" },
  { key: "field:700347", label: "Thrive" },
  { key: "field:664891", label: "Last Served" },
  { key: "field:831026", label: "Serve on Team" },
];

const profile = (overrides: Partial<PeopleProfile> = {}): PeopleProfile => ({
  personId: "1",
  firstName: "Ana",
  lastName: "Lopez",
  birthdate: "2012-03-04",
  gender: "Female",
  grade: 7,
  child: true,
  membership: null,
  status: "active",
  campusId: "9",
  campusName: "Rutherford",
  city: "Lyndhurst",
  state: "NJ",
  zip: "07071",
  pcoCreatedAt: null,
  pcoUpdatedAt: null,
  fields: { "field:471476": "Yes", "field:700347": "Completed", "field:664891": null, "field:831026": ["Kids", "Worship"] },
  syncedAt: new Date("2026-10-14T18:30:00Z"),
  removedAt: null,
  ...overrides,
});

test("table rows look like live lookups to the report columns", () => {
  const attributes = profileToAttributes(profile(), fields);
  assert.equal(attributes.first_name, "Ana");
  assert.equal(attributes.birthdate, "2012-03-04");
  assert.equal(attributes.grade, 7);
  assert.equal(attributes["custom:471476"], "Yes");
  assert.equal(attributes.baptized, "Yes"); // "Baptized?" report column
  assert.equal(attributes.completed_thrive, "Completed"); // "Completed Thrive" column
  assert.equal("last_served" in attributes, false); // empty values left out
  assert.equal(attributes["Serve on Team"], "Kids, Worship");
});

test("people missing, removed, or changed since the last pull are looked up live", () => {
  const profiles = new Map([
    ["1", profile()],
    ["2", profile({ personId: "2", removedAt: new Date() })],
    ["3", profile({ personId: "3" })],
    ["5", profile({ personId: "5", gender: "F" })],
  ]);
  const checkIns = new Map<string, Record<string, unknown>>([
    ["1", { first_name: "Ana", last_name: "Lopez", birthdate: "2012-03-04", gender: "F", grade: 7, updated_at: "2026-10-20T00:00:00Z" }],
    ["3", { first_name: "Ana", last_name: "Lopez", grade: 8 }],
    ["5", { gender: "Female" }],
  ]);
  const plan = planPeopleLookup(["1", "2", "3", "4", "5"], profiles, checkIns, fields, []);
  assert.deepEqual([...plan.fromTable.keys()].sort(), ["1", "5"]); // new updated_at alone doesn't force live; M/Male match
  assert.deepEqual(plan.live.sort(), ["2", "3", "4"]);
});

test("a template custom field the sync doesn't store sends everyone live", () => {
  const plan = planPeopleLookup(["1"], new Map([["1", profile()]]), new Map(), fields, ["custom:999"]);
  assert.equal(plan.reason, "custom_fields_not_synced");
  assert.deepEqual(plan.live, ["1"]);
  const ok = planPeopleLookup(["1"], new Map([["1", profile()]]), new Map(), fields, ["custom:471476"]);
  assert.equal(ok.reason, "ok");
  assert.equal(ok.fromTable.size, 1);
});

test("contact details are stripped", () => {
  const stripped = stripContactAttributes({
    first_name: "A", email: "a@x.org", phone_number: "1", phone_number_home: "2", phone_number_mobile: "3",
    "Primary Contact Name": "Mom", "Primary Contact Email": "m@x.org", grade: 5,
  });
  assert.deepEqual(stripped, { first_name: "A", grade: 5 });
});

test("differences only count for fields the check-in carries", () => {
  assert.equal(profileDiffersFromCheckIn(profile(), undefined), false);
  assert.equal(profileDiffersFromCheckIn(profile(), { last_name: "LOPEZ " }), false);
  assert.equal(profileDiffersFromCheckIn(profile(), { birthdate: "2012-03-05" }), true);
});
