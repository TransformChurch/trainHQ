// Engagement score (Andrew, 2026-10-27): one 0-100 number for how engaged a
// group of people is, shared by the reports' per-group Discipleship page and
// the Engagement dashboard.
//
// Parts, each a percentage of the people being scored:
//   attendance  -- their average attendance rate (attended / held weeks)
//   thrive      -- "Thrive" has a value (it holds the completion date)
//   serveClass  -- "Serve Class Completed" has a value (a date)
//   serving     -- "Last Served" falls within the serving window (90 days)
//   giving      -- reserved: no giving data yet (the Planning Center
//                  connection has no Giving access), so it never counts
// The score is the weighted average of the parts that have a value, with
// weights set in Tool Management (default: all equal). A part with weight 0
// is ignored.
//
// Person facts come from people_profiles (the weekly people sync). Which
// synced field holds Thrive / Serve Class / Last Served is chosen in the
// settings; by default it's matched by label.
import { db, peopleProfilesTable, settingsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type { SelectedPeopleField } from "./peopleSync";

export const ENGAGEMENT_PARTS = ["attendance", "thrive", "serveClass", "serving", "giving"] as const;
export type EngagementPart = typeof ENGAGEMENT_PARTS[number];
export type EngagementWeights = Record<EngagementPart, number>;
export type EngagementFieldKeys = { thrive: string | null; serveClass: string | null; lastServed: string | null };

export const PART_LABELS: Record<EngagementPart, string> = {
  attendance: "Attendance",
  thrive: "Thrive",
  serveClass: "Serve Class",
  serving: "Serving (90 days)",
  giving: "Giving",
};

export const DEFAULT_WEIGHTS: EngagementWeights = { attendance: 1, thrive: 1, serveClass: 1, serving: 1, giving: 1 };
export const DEFAULT_SERVING_WINDOW_DAYS = 90;
export const MAX_WEIGHT = 10;

export type EngagementPercentages = Record<EngagementPart, number | null>; // 0..1 or null = no data

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

export function normalizeWeights(raw: unknown): EngagementWeights {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const result = { ...DEFAULT_WEIGHTS };
  for (const part of ENGAGEMENT_PARTS) {
    if (source[part] === undefined) continue;
    const value = Number(source[part]);
    if (Number.isFinite(value)) result[part] = Math.min(MAX_WEIGHT, Math.max(0, Math.round(value * 10) / 10));
  }
  return result;
}

// Weighted average of the parts that have data, as 0-100 (null if none do).
export function engagementScore(percentages: EngagementPercentages, weights: EngagementWeights): number | null {
  let total = 0;
  let weightSum = 0;
  for (const part of ENGAGEMENT_PARTS) {
    const value = percentages[part];
    const weight = weights[part];
    if (value === null || value === undefined || !Number.isFinite(value) || weight <= 0) continue;
    total += Math.min(1, Math.max(0, value)) * weight;
    weightSum += weight;
  }
  return weightSum ? Math.round((total / weightSum) * 100) : null;
}

const NO_VALUES = new Set(["", "no", "n", "false", "0", "none", "null", "n/a", "na"]);

export function yesLike(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(yesLike);
  if (typeof value === "boolean") return value;
  return !NO_VALUES.has(String(value).trim().toLowerCase());
}

// "10/12/2026", "2026-10-12", "2026-10-12T..." -> "2026-10-12"; null otherwise.
export function parseFieldDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(Array.isArray(value) ? value[0] ?? "" : value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return null;
}

function shiftDate(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type PersonFlags = { thrive: boolean; serveClass: boolean; serving: boolean };

// One person's Thrive / Serve Class / serving facts from their synced fields.
// Serving = Last Served on/after (asOf - window days).
export function personFlags(
  fields: Record<string, unknown> | null | undefined,
  keys: EngagementFieldKeys,
  asOf: string,
  servingWindowDays = DEFAULT_SERVING_WINDOW_DAYS,
): PersonFlags {
  const get = (key: string | null) => (key && fields ? fields[key] : undefined);
  const lastServed = parseFieldDate(get(keys.lastServed));
  return {
    thrive: yesLike(get(keys.thrive)),
    serveClass: yesLike(get(keys.serveClass)),
    serving: !!lastServed && lastServed >= shiftDate(asOf, -servingWindowDays) && lastServed <= shiftDate(asOf, 1),
  };
}

export type ScoredPerson = { personId: string; attendanceRate: number | null };

export type EngagementSummary = {
  people: number;
  percentages: EngagementPercentages;
  score: number | null;
};

// Percentages + score for a set of people. People without a profile (not
// synced yet) count as "not yet" for Thrive / Serve Class / serving.
export function summarizeEngagement(
  people: ScoredPerson[],
  flags: Map<string, PersonFlags>,
  weights: EngagementWeights,
): EngagementSummary {
  const rates = people.map((person) => person.attendanceRate).filter((rate): rate is number => rate !== null && Number.isFinite(rate));
  const share = (pick: (value: PersonFlags) => boolean) =>
    people.length ? people.filter((person) => { const value = flags.get(person.personId); return !!value && pick(value); }).length / people.length : null;
  const percentages: EngagementPercentages = {
    attendance: rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null,
    thrive: share((value) => value.thrive),
    serveClass: share((value) => value.serveClass),
    serving: share((value) => value.serving),
    giving: null,
  };
  return { people: people.length, percentages, score: engagementScore(percentages, weights) };
}

// Which synced field holds each fact: the saved choice if it's still synced,
// else the first synced field whose label matches.
export function resolveFieldKeys(saved: Partial<EngagementFieldKeys> | undefined, synced: SelectedPeopleField[]): EngagementFieldKeys {
  const syncedKeys = new Set(synced.map((field) => field.key));
  const pick = (choice: string | null | undefined, pattern: RegExp) =>
    (choice && syncedKeys.has(choice) ? choice : null) ?? synced.find((field) => pattern.test(field.label))?.key ?? null;
  return {
    thrive: pick(saved?.thrive, /thrive/i),
    serveClass: pick(saved?.serveClass, /serve\s*class/i),
    lastServed: pick(saved?.lastServed, /last\s*serv/i),
  };
}

// ── Settings (settings table, key "engagement_settings"; no migration) ─────

export type TrackedItemKind = "checkins_event" | "group" | "group_type";
export type TrackedItem = { kind: TrackedItemKind; id: string; name: string };

export type EngagementSettings = {
  weights: EngagementWeights;
  fields: Partial<EngagementFieldKeys>;
  servingWindowDays: number;
  dashboard: {
    items: TrackedItem[];
    recipients: string[];
    emailEnabled: boolean;
    defaultWeeks: number;
    // Whose Planning Center connection runs the weekly sync (the admin who
    // last saved the dashboard settings).
    ownerUserId: string | null;
    ownerName: string;
  };
};

export const DASHBOARD_WEEK_OPTIONS = [4, 8, 12, 26] as const;
export const MAX_TRACKED_ITEMS = 30;
const SETTINGS_KEY = "engagement_settings";
const ITEM_KINDS: TrackedItemKind[] = ["checkins_event", "group", "group_type"];

export function normalizeTrackedItems(raw: unknown): TrackedItem[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const items: TrackedItem[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    const kind = source.kind as TrackedItemKind;
    const id = String(source.id ?? "").trim();
    if (!ITEM_KINDS.includes(kind) || !/^\d{1,20}$/.test(id)) continue;
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ kind, id, name: String(source.name ?? "").trim().slice(0, 120) || id });
    if (items.length >= MAX_TRACKED_ITEMS) break;
  }
  return items;
}

export function normalizeSettings(raw: unknown): EngagementSettings {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const dashboard = (source.dashboard && typeof source.dashboard === "object" ? source.dashboard : {}) as Record<string, any>;
  const window = Number(source.servingWindowDays);
  const weeks = Number(dashboard.defaultWeeks);
  const fields = (source.fields && typeof source.fields === "object" ? source.fields : {}) as Record<string, unknown>;
  const fieldKey = (value: unknown) => (typeof value === "string" && /^(field|attr):[\w-]{1,40}$/.test(value) ? value : null);
  return {
    weights: normalizeWeights(source.weights),
    fields: { thrive: fieldKey(fields.thrive), serveClass: fieldKey(fields.serveClass), lastServed: fieldKey(fields.lastServed) },
    servingWindowDays: Number.isInteger(window) && window >= 7 && window <= 365 ? window : DEFAULT_SERVING_WINDOW_DAYS,
    dashboard: {
      items: normalizeTrackedItems(dashboard.items),
      recipients: Array.isArray(dashboard.recipients) ? dashboard.recipients.filter((value: unknown) => typeof value === "string").slice(0, 10) : [],
      emailEnabled: dashboard.emailEnabled === true,
      defaultWeeks: (DASHBOARD_WEEK_OPTIONS as readonly number[]).includes(weeks) ? weeks : 8,
      ownerUserId: typeof dashboard.ownerUserId === "string" ? dashboard.ownerUserId : null,
      ownerName: typeof dashboard.ownerName === "string" ? dashboard.ownerName : "",
    },
  };
}

export async function readEngagementSettings(): Promise<EngagementSettings> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, SETTINGS_KEY)).limit(1);
  try {
    return normalizeSettings(rows[0] ? JSON.parse(rows[0].value) : {});
  } catch {
    return normalizeSettings({});
  }
}

export async function writeEngagementSettings(settings: EngagementSettings): Promise<void> {
  const value = JSON.stringify(settings);
  await db.insert(settingsTable).values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

// ── Profile lookup ──────────────────────────────────────────────────────────

const CHUNK = 1000;

export async function loadPersonFlags(
  personIds: string[],
  keys: EngagementFieldKeys,
  asOf: string,
  servingWindowDays: number,
): Promise<Map<string, PersonFlags>> {
  const ids = [...new Set(personIds.filter(Boolean))];
  const flags = new Map<string, PersonFlags>();
  for (let index = 0; index < ids.length; index += CHUNK) {
    const rows = await db.select({ personId: peopleProfilesTable.personId, fields: peopleProfilesTable.fields })
      .from(peopleProfilesTable)
      .where(inArray(peopleProfilesTable.personId, ids.slice(index, index + CHUNK)));
    for (const row of rows) flags.set(row.personId, personFlags(row.fields, keys, asOf, servingWindowDays));
  }
  return flags;
}
