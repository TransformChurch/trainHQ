// Where a report's attendees live, for the optional "Where our ... live" map
// page (attached_assets/report_map.py). Added 2026-10-21 (Andrew).
//
// At prepare time every report counts its people per 5-digit ZIP: the ZIP
// on the person's report record (from the people table or a live lookup,
// primary address -- never the street), else the people_profiles table.
// Only these counts are kept, in report_runs.meta under "locations"; the
// engine gets them as --locations-json when the map page is switched on.
// People not in the table yet (e.g. a first-time guest added after the last
// weekly pull) or without an address count as "no address on file".
import { db, peopleProfilesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

export type RunLocations = {
  zips: Record<string, number>;
  noZip: number;
  total: number;
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
export function summarizeLocations(personIds: string[], total: number, zipByPerson: Map<string, unknown>): RunLocations {
  const zips: Record<string, number> = {};
  let withZip = 0;
  for (const id of new Set(personIds)) {
    const zip = zip5(zipByPerson.get(id));
    if (!zip) continue;
    zips[zip] = (zips[zip] ?? 0) + 1;
    withZip += 1;
  }
  return { zips, noZip: Math.max(0, total - withZip), total };
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
  for (let index = 0; index < missing.length; index += CHUNK) {
    const rows = await db.select({ personId: peopleProfilesTable.personId, zip: peopleProfilesTable.zip })
      .from(peopleProfilesTable)
      .where(inArray(peopleProfilesTable.personId, missing.slice(index, index + CHUNK)));
    for (const row of rows) zipByPerson.set(row.personId, row.zip);
  }
  return summarizeLocations(ids, total, zipByPerson);
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
    return { zips, noZip: Math.max(0, Number(value.noZip) || 0), total: Math.max(0, Number(value.total) || 0) };
  } catch {
    return null;
  }
}
