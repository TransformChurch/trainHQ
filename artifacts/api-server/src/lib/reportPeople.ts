// Report person details from the local people_profiles table (the weekly
// Planning Center people sync, routes/peopleSync.ts) instead of one or two
// live People API calls per person. Switched 2026-10-14 (Andrew).
//
// Who still gets a live lookup (routes/reports.ts fetchPeopleDetails):
//   - anyone not in the table yet (e.g. a first-time guest whose profile was
//     created at the kiosk after the last weekly pull), or marked removed;
//   - anyone whose name, birthdate, gender or grade on the check-in differs
//     from the table (their profile changed after the last weekly pull). The
//     check-in's person record comes with the check-ins at no extra cost.
//     Values are compared rather than updated_at, which Check-Ins may bump
//     on every check-in. Custom fields (Baptized?, Thrive...) can't be
//     compared this way, so a change made this week shows after Monday's
//     pull -- or right away after "Pull now" on the people sync card.
//   - everyone, if the template pulls a custom field the people sync doesn't
//     store (the table can't answer it).
// Emails and phone numbers are no longer part of reports (none of the report
// engines use them), so they're dropped from live lookups too, keeping the
// CSV consistent whichever way a person was looked up.
import { db, peopleProfilesTable, settingsTable, type PeopleProfile } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { customFieldId, effectiveFields, normalizeSelectedFields, type SelectedPeopleField } from "./peopleSync";

// Report-field lookup names (routes/reports.ts nestedValue) for the standard
// people-sync columns, so the existing report columns find them.
const STANDARD_ALIASES: Record<string, string[]> = {
  "Baptized?": ["baptized"],
  "Thrive": ["completed_thrive"],
  "Last Served": ["last_served"],
};

const CONTACT_KEY = /^(email|primary_email|emails|phone|phone_number.*|.*_phone_number|phone_home|phone_mobile)$/i;
const PRIMARY_CONTACT = new Set(["primarycontactname", "primarycontactemail"]);

// Removes contact details from a live-lookup person record.
export function stripContactAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (CONTACT_KEY.test(key)) continue;
    if (PRIMARY_CONTACT.has(key.toLowerCase().replace(/[^a-z0-9]/g, ""))) continue;
    result[key] = value;
  }
  return result;
}

// One table row -> the same shape a live lookup produces: Planning Center
// attribute names, plus every stored custom field under "custom:<id>" and
// under its label (and report aliases for the standard columns).
export function profileToAttributes(profile: PeopleProfile, fields: SelectedPeopleField[]): Record<string, unknown> {
  const attributes: Record<string, unknown> = {
    first_name: profile.firstName ?? undefined,
    last_name: profile.lastName ?? undefined,
    birthdate: profile.birthdate ?? undefined,
    gender: profile.gender ?? undefined,
    grade: profile.grade ?? undefined,
    child: profile.child ?? undefined,
    membership: profile.membership ?? undefined,
    status: profile.status ?? undefined,
    city: profile.city ?? undefined,
    state: profile.state ?? undefined,
    zip: profile.zip ?? undefined,
  };
  for (const field of fields) {
    const raw = profile.fields?.[field.key];
    if (raw === null || raw === undefined || raw === "") continue;
    const value = Array.isArray(raw) ? raw.join(", ") : raw;
    const id = customFieldId(field.key);
    if (id) attributes[`custom:${id}`] = value;
    attributes[field.label] = value;
    for (const alias of STANDARD_ALIASES[field.label] ?? []) attributes[alias] = value;
  }
  for (const key of Object.keys(attributes)) if (attributes[key] === undefined) delete attributes[key];
  return attributes;
}

function norm(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

// True when the check-in's copy of the person disagrees with the table on
// anything the check-in carries. Fields missing on the check-in are ignored.
export function profileDiffersFromCheckIn(profile: PeopleProfile, checkInPerson: Record<string, unknown> | undefined): boolean {
  if (!checkInPerson) return false;
  const pairs: [unknown, unknown][] = [
    [checkInPerson.first_name, profile.firstName],
    [checkInPerson.last_name, profile.lastName],
    [typeof checkInPerson.birthdate === "string" ? checkInPerson.birthdate.slice(0, 10) : checkInPerson.birthdate, profile.birthdate],
    [checkInPerson.grade, profile.grade],
  ];
  for (const [fromCheckIn, fromTable] of pairs) {
    if (fromCheckIn === undefined) continue;
    if (norm(fromCheckIn) !== norm(fromTable)) return true;
  }
  // Gender may be "M" in one place and "Male" in the other: compare the
  // first letter only.
  if (checkInPerson.gender !== undefined && norm(checkInPerson.gender).charAt(0) !== norm(profile.gender).charAt(0)) return true;
  return false;
}

// Decides, per person, table vs live. `checkInsPeople` are the person
// records included with the check-ins.
export function planPeopleLookup(
  personIds: string[],
  profiles: Map<string, PeopleProfile>,
  checkInsPeople: Map<string, Record<string, unknown>>,
  fields: SelectedPeopleField[],
  requiredCustomKeys: string[],
): { fromTable: Map<string, Record<string, unknown>>; live: string[]; reason: "ok" | "custom_fields_not_synced" } {
  const stored = new Set(fields.map((field) => customFieldId(field.key)).filter((id): id is string => !!id));
  const missingCustom = requiredCustomKeys.some((key) => {
    const id = key.startsWith("custom:") ? key.slice("custom:".length) : null;
    return !id || !stored.has(id);
  });
  if (missingCustom) return { fromTable: new Map(), live: [...personIds], reason: "custom_fields_not_synced" };

  const fromTable = new Map<string, Record<string, unknown>>();
  const live: string[] = [];
  for (const id of personIds) {
    const profile = profiles.get(id);
    if (!profile || profile.removedAt) {
      live.push(id);
      continue;
    }
    if (profileDiffersFromCheckIn(profile, checkInsPeople.get(id))) {
      live.push(id);
      continue;
    }
    fromTable.set(id, profileToAttributes(profile, fields));
  }
  return { fromTable, live, reason: "ok" };
}

// Reads the people sync's column choices the same way routes/peopleSync.ts
// does (kept separate to avoid a reports <-> peopleSync import cycle).
async function syncedFields(): Promise<SelectedPeopleField[]> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "people_sync")).limit(1);
  try {
    const parsed = rows[0] ? JSON.parse(rows[0].value) : {};
    const standard = Array.isArray(parsed.standard) ? parsed.standard : [];
    return effectiveFields(standard, normalizeSelectedFields(parsed.fields));
  } catch {
    return [];
  }
}

const LOOKUP_CHUNK = 1000;

export async function lookupReportPeople(
  personIds: string[],
  checkInsPeople: Map<string, Record<string, unknown>>,
  requiredCustomKeys: string[],
) {
  const fields = await syncedFields();
  const profiles = new Map<string, PeopleProfile>();
  for (let index = 0; index < personIds.length; index += LOOKUP_CHUNK) {
    const chunk = personIds.slice(index, index + LOOKUP_CHUNK);
    if (!chunk.length) continue;
    const rows = await db.select().from(peopleProfilesTable).where(inArray(peopleProfilesTable.personId, chunk));
    for (const row of rows) profiles.set(row.personId, row);
  }
  return planPeopleLookup(personIds, profiles, checkInsPeople, fields, requiredCustomKeys);
}
