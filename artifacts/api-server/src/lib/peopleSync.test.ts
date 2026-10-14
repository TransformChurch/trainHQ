import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPeopleCsv, buildProfileRows, effectiveFields, normalizeSelectedFields, resolveStandardFields, safeNextLink } from "./peopleSync";

const page = ({
  data: [
    {
      id: "101",
      type: "Person",
      attributes: {
        first_name: "Ana", last_name: "Lopez", birthdate: "2010-04-02", gender: "Female", grade: 9, child: false,
        membership: "Member", status: "active", created_at: "2020-01-01T00:00:00Z", updated_at: "2026-10-01T12:00:00Z",
        nickname: "Annie", medical_notes: "should never be copied",
      },
      relationships: {
        primary_campus: { data: { type: "Campus", id: "7" } },
        addresses: { data: [{ type: "Address", id: "a1" }, { type: "Address", id: "a2" }] },
        field_data: { data: [{ type: "FieldDatum", id: "f1" }, { type: "FieldDatum", id: "f2" }, { type: "FieldDatum", id: "f3" }, { type: "FieldDatum", id: "f4" }] },
      },
    },
    { id: "102", type: "Person", attributes: { first_name: "Ben", last_name: "=cmd()", grade: "-1" }, relationships: { primary_campus: { data: null } } },
  ],
  included: [
    { id: "7", type: "Campus", attributes: { name: "Rutherford" } },
    { id: "a1", type: "Address", attributes: { street_line_1: "1 Secret St", city: "Clifton", state: "NJ", zip: "07011", primary: false } },
    { id: "a2", type: "Address", attributes: { street_line_1: "2 Home Ave", city: "Lyndhurst", state: "NJ", zip: "07071", primary: true } },
    { id: "f1", type: "FieldDatum", attributes: { value: "2024-06-09" }, relationships: { field_definition: { data: { id: "555" } } } },
    { id: "f2", type: "FieldDatum", attributes: { value: "Worship" }, relationships: { field_definition: { data: { id: "777" } } } },
    { id: "f3", type: "FieldDatum", attributes: { value: "Kids" }, relationships: { field_definition: { data: { id: "777" } } } },
    { id: "f4", type: "FieldDatum", attributes: { value: "not picked" }, relationships: { field_definition: { data: { id: "999" } } } },
  ],
}) as unknown as Parameters<typeof buildProfileRows>[0];

const selected = normalizeSelectedFields([
  { key: "attr:nickname", label: "Nickname" },
  { key: "field:555", label: "Baptism date" },
  { key: "field:777", label: "Serving teams" },
  { key: "attr:medical_notes", label: "nope" },
  { key: "field:555", label: "dup" },
  { key: "emails", label: "nope" },
]);

test("normalizeSelectedFields keeps only allowed keys, once", () => {
  assert.deepEqual(selected.map((field) => field.key), ["attr:nickname", "field:555", "field:777"]);
});

test("buildProfileRows maps basics, campus, built-in and custom fields", () => {
  const rows = buildProfileRows(page, selected);
  assert.equal(rows.length, 2);
  const [ana, ben] = rows;
  assert.equal(ana.personId, "101");
  assert.equal(ana.birthdate, "2010-04-02");
  assert.equal(ana.grade, 9);
  assert.equal(ana.campusName, "Rutherford");
  assert.deepEqual(ana.fields, { "attr:nickname": "Annie", "field:555": "2024-06-09", "field:777": ["Worship", "Kids"] });
  assert.equal(JSON.stringify(ana).includes("should never be copied"), false);
  assert.equal(ben.grade, -1);
  assert.equal(ben.campusId, null);
  assert.deepEqual(ben.fields, { "attr:nickname": null, "field:555": null, "field:777": null });
});

test("CSV has one column per picked field and neutralizes formulas", () => {
  const csv = buildPeopleCsv(buildProfileRows(page, selected), selected);
  const [header, first, second] = csv.trim().split("\r\n");
  assert.ok(header.endsWith("Nickname,Baptism date,Serving teams"));
  assert.ok(first.endsWith("Annie,2024-06-09,Worship; Kids"));
  assert.ok(second.includes("'=cmd()"));
});

test("only Planning Center pagination links are followed", () => {
  assert.equal(safeNextLink("https://api.planningcenteronline.com/people/v2/people?offset=100"), "https://api.planningcenteronline.com/people/v2/people?offset=100");
  assert.equal(safeNextLink("https://evil.example/people"), null);
  assert.equal(safeNextLink(undefined), null);
});

test("primary address gives city/state/zip and the street is never kept", () => {
  const [ana, ben] = buildProfileRows(page, selected);
  assert.deepEqual([ana.city, ana.state, ana.zip], ["Lyndhurst", "NJ", "07071"]);
  assert.equal(JSON.stringify(ana).includes("Home Ave"), false);
  assert.deepEqual([ben.city, ben.zip], [null, null]);
});

test("standard fields are matched by name, ignoring case and punctuation", () => {
  const resolved = resolveStandardFields([
    { id: "11", name: "BAPTIZED" },
    { id: "12", name: "thrive" },
    { id: "13", name: "Serve-Class" }, // no longer standard (Andrew, 10/14): must not be matched
    { id: "14", name: "Baptism Date" },
  ]);
  assert.deepEqual(resolved, [
    { label: "Baptized?", key: "field:11" },
    { label: "Thrive", key: "field:12" },
    { label: "Last Served", key: null },
  ]);
  const fields = effectiveFields(resolved, [{ key: "field:12", label: "dup" }, { key: "attr:nickname", label: "Nickname" }]);
  assert.deepEqual(fields.map((field) => field.label), ["Baptized?", "Thrive", "Nickname"]);
});
