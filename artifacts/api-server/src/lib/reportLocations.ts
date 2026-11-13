// Where a report's attendees live, for the optional "Where our ... live" map
// page (attached_assets/report_map.py). Added 2026-10-21 (Andrew).
//
// At prepare time every report counts its people per 5-digit ZIP: the ZIP
// on the person's report record (from the people table or a live lookup,
// primary address -- never the street), else the people_profiles table.
// Only these counts are kept, in report_runs.meta under "locations"; the
// engine gets them as --locations-json when the map page is switched on.
// Since 2026-11-13 (Andrew: "very helpful for us to see the household
// locations") anyone with no address of their own -- most kids -- is placed
// at their Planning Center household's ZIP: the one most members of the
// household have. People not in the table yet (e.g. a first-time guest added
// after the last weekly pull) or with no address on them or their household
// count as "no address on file".
import { db, peopleProfilesTable } from "@workspace/db";
import { and, inArray, isNull, sql } from "drizzle-orm";

export type RunLocations = {
  zips: Record<string, number>;
  noZip: number;
  total: number;
  // How many of the mapped people were placed by their household's address.
  fromHousehold?: number;
};

// "07070-1234" / "7070" (lost leading zero) / " 07070 " -> "07070"; null if unusable.
export function zip5(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).trim().split("-")[0].replace(/\s+/g, "");
  if (/^\d{5}$/.test(digits)) return digits;
  if (/^\d{4}$/.test(digits)) return `0${digits}`; // spreadsheet-mangled NJ ZIP
  if (/^\d{9}$/.test(digits)) return digits.slice(0, 5);
  return null;
}

// Pure counting step (unit-tested): `total` is everyone in the report,
// including people with no Planning Center id.
export function summarizeLocations(
  personIds: string[],
  total: number,
  zipByPerson: Map<string, unknown>,
  householdZipByPerson: Map<string, string> = new Map(),
): RunLocations {
  const zips: Record<string, number> = {};
  let withZip = 0;
  let fromHousehold = 0;
  for (const id of new Set(personIds)) {
    let zip = zip5(zipByPerson.get(id));
    if (!zip) {
      zip = zip5(householdZipByPerson.get(id));
      if (zip) fromHousehold += 1;
    }
    if (!zip) continue;
    zips[zip] = (zips[zip] ?? 0) + 1;
    withZip += 1;
  }
  return { zips, noZip: Math.max(0, total - withZip), total, fromHousehold };
}

// Each household's ZIP: the one most of its members have (ties -> the
// smaller ZIP, so it's stable). Pure; unit-tested.
export function householdZips(members: { zip: unknown; householdIds: string[] }[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const member of members) {
    const zip = zip5(member.zip);
    if (!zip) continue;
    for (const household of member.householdIds ?? []) {
      const byZip = counts.get(household) ?? new Map<string, number>();
      byZip.set(zip, (byZip.get(zip) ?? 0) + 1);
      counts.set(household, byZip);
    }
  }
  const result = new Map<string, string>();
  for (const [household, byZip] of counts) {
    const best = [...byZip.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (best) result.set(household, best[0]);
  }
  return result;
}

// A person's household ZIP: from the first of their households (in
// Planning Center's order) that has one.
export function personHouseholdZip(householdIds: string[], zipByHousehold: Map<string, string>): string | null {
  for (const household of householdIds ?? []) {
    const zip = zipByHousehold.get(household);
    if (zip) return zip;
  }
  return null;
}

const CHUNK = 1000;

export async function loadRunLocations(
  personIds: string[],
  total: number,
  knownZips: Map<string, unknown> = new Map(),
): Promise<RunLocations> {
  const ids = [...new Set(personIds.filter(Boolean))];
  const zipByPerson = new Map<string, unknown>();
  for (const id of ids) if (zip5(knownZips.get(id))) zipByPerson.set(id, knownZips.get(id));
  const missing = ids.filter((id) => !zipByPerson.has(id));
  const householdsByPerson = new Map<string, string[]>();
  for (let index = 0; index < missing.length; index += CHUNK) {
    const rows = await db.select({
      personId: peopleProfilesTable.personId,
      zip: peopleProfilesTable.zip,
      householdIds: peopleProfilesTable.householdIds,
    })
      .from(peopleProfilesTable)
      .where(inArray(peopleProfilesTable.personId, missing.slice(index, index + CHUNK)));
    for (const row of rows) {
      zipByPerson.set(row.personId, row.zip);
      if (!zip5(row.zip) && Array.isArray(row.householdIds) && row.householdIds.length) {
        householdsByPerson.set(row.personId, row.householdIds.map(String));
      }
    }
  }
  // Still no ZIP: use their household's (everyone in it, not only people in
  // this report).
  const householdZipByPerson = new Map<string, string>();
  const households = [...new Set([...householdsByPerson.values()].flat())];
  if (households.length) {
    const members: { zip: unknown; householdIds: string[] }[] = [];
    for (let index = 0; index < households.length; index += CHUNK) {
      const chunk = households.slice(index, index + CHUNK);
      const rows = await db.select({ zip: peopleProfilesTable.zip, householdIds: peopleProfilesTable.householdIds })
        .from(peopleProfilesTable)
        .where(and(
          isNull(peopleProfilesTable.removedAt),
          sql`${peopleProfilesTable.householdIds} ?| ${sql`array[${sql.join(chunk.map((id) => sql`${id}`), sql`, `)}]::text[]`}`,
        ));
      members.push(...rows.map((row) => ({ zip: row.zip, householdIds: Array.isArray(row.householdIds) ? row.householdIds.map(String) : [] })));
    }
    const zipByHousehold = householdZips(members);
    for (const [personId, ids] of householdsByPerson) {
      const zip = personHouseholdZip(ids, zipByHousehold);
      if (zip) householdZipByPerson.set(personId, zip);
    }
  }
  return summarizeLocations(ids, total, zipByPerson, householdZipByPerson);
}

// report_runs.meta is a JSON object: season reports keep their season
// fields there, and every run (season or not) may carry "locations".
export function runMetaWithLocations(meta: object | null, locations: RunLocations | null): string | null {
  if (!meta && !locations) return null;
  return JSON.stringify({ ...(meta ?? {}), ...(locations ? { locations } : {}) });
}

export function parseRunLocations(raw: string | null | undefined): RunLocations | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw)?.locations;
    if (!value || typeof value !== "object" || typeof value.zips !== "object" || value.zips === null) return null;
    const zips: Record<string, number> = {};
    for (const [zip, count] of Object.entries(value.zips as Record<string, unknown>)) {
      const n = Number(count);
      if (/^\d{5}$/.test(zip) && Number.isInteger(n) && n > 0) zips[zip] = n;
    }
    const fromHousehold = Math.max(0, Number(value.fromHousehold) || 0);
    return {
      zips,
      noZip: Math.max(0, Number(value.noZip) || 0),
      total: Math.max(0, Number(value.total) || 0),
      ...(fromHousehold ? { fromHousehold } : {}),
    };
  } catch {
    return null;
  }
}
