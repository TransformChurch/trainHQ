// Pure helpers for the Planning Center people sync (routes/peopleSync.ts):
// which fields can be picked, and how one page of GET /people/v2/people is
// turned into people_profiles rows. Kept free of DB/network code so it can be
// unit-tested with fixture pages.
import type { JsonApiResource } from "../routes/reports";

export type PeopleFieldValue = string | string[] | number | boolean | null;

// Built-in Person attributes an admin can add as extra columns. The basics
// (name, birthdate, gender, grade, child, membership, status, campus,
// city/state/zip, created/updated) are always pulled into their own columns
// and aren't listed here. Emails, phones, street addresses and medical notes
// are intentionally absent.
export const BUILT_IN_PEOPLE_FIELDS: { key: string; label: string; attribute: string }[] = [
  { key: "attr:middle_name", label: "Middle name", attribute: "middle_name" },
  { key: "attr:nickname", label: "Nickname", attribute: "nickname" },
  { key: "attr:given_name", label: "Given name", attribute: "given_name" },
  { key: "attr:anniversary", label: "Anniversary", attribute: "anniversary" },
  { key: "attr:graduation_year", label: "Graduation year", attribute: "graduation_year" },
  { key: "attr:school_type", label: "School type", attribute: "school_type" },
  { key: "attr:inactivated_at", label: "Inactivated at", attribute: "inactivated_at" },
  { key: "attr:passed_background_check", label: "Passed background check", attribute: "passed_background_check" },
  { key: "attr:site_administrator", label: "Site administrator", attribute: "site_administrator" },
  { key: "attr:remote_id", label: "Remote ID", attribute: "remote_id" },
];

export type SelectedPeopleField = { key: string; label: string };

// Church-standard custom fields, always pulled (Andrew, 2026-10-13). They're
// custom fields in Planning Center People, so they're found by name among
// the account's field definitions on every pull -- renaming one in Planning
// Center only needs its new name added to `names` here. Names are compared
// ignoring case, spaces and punctuation.
export const STANDARD_CUSTOM_FIELDS: { label: string; names: string[] }[] = [
  { label: "Baptized?", names: ["Baptized?", "Baptized"] },
  { label: "Thrive", names: ["Thrive"] },
  { label: "Last Served", names: ["Last Served"] },
];

export type StandardFieldResolution = { label: string; key: string | null };

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Maps each standard field to a Planning Center field definition by name
// (key null when no definition matches). If several match, the first wins.
export function resolveStandardFields(definitions: { id: string; name: string }[]): StandardFieldResolution[] {
  return STANDARD_CUSTOM_FIELDS.map((standard) => {
    const wanted = new Set(standard.names.map(normalizeName));
    const match = definitions.find((definition) => wanted.has(normalizeName(definition.name)));
    return { label: standard.label, key: match ? `field:${match.id}` : null };
  });
}

// Standard fields first (in their fixed order), then the admin's extras,
// without duplicates.
export function effectiveFields(standard: StandardFieldResolution[], extras: SelectedPeopleField[]): SelectedPeopleField[] {
  const result: SelectedPeopleField[] = [];
  const seen = new Set<string>();
  for (const field of standard) {
    if (!field.key || seen.has(field.key)) continue;
    seen.add(field.key);
    result.push({ key: field.key, label: field.label });
  }
  for (const field of extras) {
    if (seen.has(field.key)) continue;
    seen.add(field.key);
    result.push(field);
  }
  return result;
}

const CUSTOM_FIELD_KEY = /^field:(\d{1,20})$/;

export function customFieldId(key: string): string | null {
  return CUSTOM_FIELD_KEY.exec(key)?.[1] ?? null;
}

// Validates what the admin UI sends: known built-in keys or "field:<id>"
// custom-field keys, each with a short label; duplicates dropped; max 100.
export function normalizeSelectedFields(raw: unknown): SelectedPeopleField[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: SelectedPeopleField[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const key = typeof (entry as { key?: unknown }).key === "string" ? (entry as { key: string }).key.trim() : "";
    const builtIn = BUILT_IN_PEOPLE_FIELDS.find((field) => field.key === key);
    if (!builtIn && !customFieldId(key)) continue;
    if (seen.has(key)) continue;
    const rawLabel = (entry as { label?: unknown }).label;
    const label = (typeof rawLabel === "string" && rawLabel.trim() ? rawLabel.trim() : builtIn?.label ?? key).slice(0, 120);
    seen.add(key);
    result.push({ key, label });
    if (result.length >= 100) break;
  }
  return result;
}

function str(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function dateOnly(value: unknown): string | null {
  const text = str(value);
  return text && /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

function timestamp(value: unknown): Date | null {
  const text = str(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function intOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function attributeValue(value: unknown): PeopleFieldValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  return null;
}

export type PeopleProfileRow = {
  personId: string;
  firstName: string | null;
  lastName: string | null;
  birthdate: string | null;
  gender: string | null;
  grade: number | null;
  child: boolean | null;
  membership: string | null;
  status: string | null;
  campusId: string | null;
  campusName: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  pcoCreatedAt: Date | null;
  pcoUpdatedAt: Date | null;
  fields: Record<string, PeopleFieldValue>;
};

function relationshipIds(resource: JsonApiResource, name: string): string[] {
  const data = (resource.relationships as Record<string, { data?: unknown }> | undefined)?.[name]?.data;
  if (Array.isArray(data)) return data.map((entry) => str((entry as { id?: unknown })?.id)).filter((id): id is string => !!id);
  const single = str((data as { id?: unknown } | null | undefined)?.id);
  return single ? [single] : [];
}

// Turns one page (data + included) into rows. Custom field values come from
// the page's included FieldDatum resources; a checkbox field with several
// ticked options has one datum per option, which become a string array.
export function buildProfileRows(
  page: { data?: JsonApiResource[]; included?: JsonApiResource[] },
  selected: SelectedPeopleField[],
): PeopleProfileRow[] {
  const included = Array.isArray(page.included) ? page.included : [];
  const byTypeAndId = new Map<string, JsonApiResource>();
  for (const resource of included) byTypeAndId.set(`${resource.type}:${resource.id}`, resource);
  const builtIns = selected
    .map((field) => BUILT_IN_PEOPLE_FIELDS.find((entry) => entry.key === field.key))
    .filter((field): field is (typeof BUILT_IN_PEOPLE_FIELDS)[number] => !!field);
  const customIds = new Set(selected.map((field) => customFieldId(field.key)).filter((id): id is string => !!id));

  const rows: PeopleProfileRow[] = [];
  for (const person of Array.isArray(page.data) ? page.data : []) {
    const personId = str(person.id);
    if (!personId) continue;
    const attributes = (person.attributes ?? {}) as Record<string, unknown>;
    const campusId = relationshipIds(person, "primary_campus")[0] ?? null;
    const campus = campusId ? byTypeAndId.get(`Campus:${campusId}`) : undefined;

    // Primary address if marked, else the first one. Street lines are never read.
    const addresses = relationshipIds(person, "addresses")
      .map((id) => byTypeAndId.get(`Address:${id}`))
      .filter((address): address is JsonApiResource => !!address);
    const address = addresses.find((entry) => (entry.attributes as Record<string, unknown> | undefined)?.primary === true) ?? addresses[0];
    const addressAttributes = (address?.attributes ?? {}) as Record<string, unknown>;

    const fields: Record<string, PeopleFieldValue> = {};
    for (const field of builtIns) fields[field.key] = attributeValue(attributes[field.attribute]);
    if (customIds.size) {
      for (const id of customIds) fields[`field:${id}`] = null;
      for (const datumId of relationshipIds(person, "field_data")) {
        const datum = byTypeAndId.get(`FieldDatum:${datumId}`);
        if (!datum) continue;
        const definitionId = relationshipIds(datum, "field_definition")[0];
        if (!definitionId || !customIds.has(definitionId)) continue;
        const value = str((datum.attributes as Record<string, unknown> | undefined)?.value);
        if (value === null) continue;
        const key = `field:${definitionId}`;
        const existing = fields[key];
        fields[key] = existing === null || existing === undefined
          ? value
          : Array.isArray(existing) ? [...existing, value] : [String(existing), value];
      }
    }

    rows.push({
      personId,
      firstName: str(attributes.first_name),
      lastName: str(attributes.last_name),
      birthdate: dateOnly(attributes.birthdate),
      gender: str(attributes.gender),
      grade: intOrNull(attributes.grade),
      child: typeof attributes.child === "boolean" ? attributes.child : null,
      membership: str(attributes.membership),
      status: str(attributes.status),
      campusId,
      campusName: campus ? str((campus.attributes as Record<string, unknown> | undefined)?.name) : null,
      city: str(addressAttributes.city),
      state: str(addressAttributes.state),
      zip: str(addressAttributes.zip),
      pcoCreatedAt: timestamp(attributes.created_at),
      pcoUpdatedAt: timestamp(attributes.updated_at),
      fields,
    });
  }
  return rows;
}

const PCO_HOST = "https://api.planningcenteronline.com/";

// Only follow pagination links that point back at Planning Center.
export function safeNextLink(next: unknown): string | null {
  return typeof next === "string" && next.startsWith(PCO_HOST) ? next : null;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) ? value.join("; ") : String(value);
  // Neutralize spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildPeopleCsv(
  rows: (Omit<PeopleProfileRow, "pcoCreatedAt" | "pcoUpdatedAt"> & { pcoCreatedAt: Date | null; pcoUpdatedAt: Date | null })[],
  selected: SelectedPeopleField[],
): string {
  const header = [
    "Planning Center ID", "First name", "Last name", "Birthdate", "Gender", "Grade", "Child", "Membership",
    "Status", "Campus", "City", "State", "Zip", "Created in Planning Center", "Updated in Planning Center",
    ...selected.map((field) => field.label),
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push([
      row.personId, row.firstName, row.lastName, row.birthdate, row.gender, row.grade, row.child, row.membership,
      row.status, row.campusName, row.city, row.state, row.zip, row.pcoCreatedAt?.toISOString() ?? "", row.pcoUpdatedAt?.toISOString() ?? "",
      ...selected.map((field) => row.fields?.[field.key] ?? null),
    ].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
