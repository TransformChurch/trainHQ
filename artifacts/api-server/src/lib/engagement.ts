// Engagement score (Andrew; 0-100 on 2026-10-27, points out of 17 since
// 2026-11-10): how engaged a person or a group of people is, shared by the
// reports' per-group Discipleship page and the Engagement tool.
//
// Parts and their default points (editable in Tool Management > Engagement):
//   formThrive  1  "Thrive" has a value, OR they've submitted any Planning
//                  Center form (lib/engagementForms.ts; admins can exclude
//                  forms such as staff reports)
//   transform   2  attendance rate in the tracked Transform groups / events
//                  (partial credit: half the weeks = half the points)
//   serving     3  "Last Served" within the serving window (90 days)
//   tcCollege   3  checked in at a tracked TC College event in the last
//                  26 weeks
//   giving      4  the admin-picked Giving field has a value (never amounts)
//   leadership  4  the admin-picked Leadership field has a value
//   serveClass  0  "Serve Class Completed" (kept, off by default)
// For a group, each part is the share of its people (transform: their
// average attendance rate) and the score is points earned on average.
//
// A part whose data isn't set up (no Leadership field picked, no TC College
// event tracked...) is left out and the score is scaled so it still reads
// out of the full total, e.g. 12 of the 13 available points = 15.7 / 17.
//
// Person facts come from people_profiles (the weekly people sync). Thrive /
// Serve Class / Last Served are matched by label unless an admin picks a
// field; Giving and Leadership are only ever an explicit pick.
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db, engagementAttendanceTable, peopleProfilesTable, settingsTable } from "@workspace/db";
import type { SelectedPeopleField } from "./peopleSync";

export const ENGAGEMENT_PARTS = ["formThrive", "transform", "serving", "tcCollege", "giving", "leadership", "serveClass"] as const;
export type EngagementPart = typeof ENGAGEMENT_PARTS[number];
export type EngagementPoints = Record<EngagementPart, number>;
export type EngagementFieldKeys = {
  thrive: string | null;
  serveClass: string | null;
  lastServed: string | null;
  giving: string | null;
  leadership: string | null;
};

export const PART_LABELS: Record<EngagementPart, string> = {
  formThrive: "Form / Thrive",
  transform: "Transform",
  serving: "Serving",
  tcCollege: "TC College",
  giving: "Giving",
  leadership: "Leadership",
  serveClass: "Serve Class",
};

export const DEFAULT_POINTS: EngagementPoints = { formThrive: 1, transform: 2, serving: 3, tcCollege: 3, giving: 4, leadership: 4, serveClass: 0 };
export const DEFAULT_SERVING_WINDOW_DAYS = 90;
export const MAX_PART_POINTS = 20;
export const TC_COLLEGE_LOOKBACK_WEEKS = 26;

export type EngagementPercentages = Record<EngagementPart, number | null>; // 0..1 or null = no data

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

export function normalizePoints(raw: unknown): EngagementPoints {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const result = { ...DEFAULT_POINTS };
  for (const part of ENGAGEMENT_PARTS) {
    if (source[part] === undefined) continue;
    const value = Number(source[part]);
    if (Number.isFinite(value)) result[part] = Math.min(MAX_PART_POINTS, Math.max(0, Math.round(value * 10) / 10));
  }
  return result;
}

export function totalPoints(points: EngagementPoints): number {
  return Math.round(ENGAGEMENT_PARTS.reduce((sum, part) => sum + points[part], 0) * 10) / 10;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

// Points earned, out of totalPoints(points): the points-weighted average of
// the parts that have data, scaled to the full total. Null if no part has data.
export function engagementScore(percentages: EngagementPercentages, points: EngagementPoints): number | null {
  let earned = 0;
  let available = 0;
  for (const part of ENGAGEMENT_PARTS) {
    const value = percentages[part];
    const weight = points[part];
    if (value === null || value === undefined || !Number.isFinite(value) || weight <= 0) continue;
    earned += Math.min(1, Math.max(0, value)) * weight;
    available += weight;
  }
  return available ? round1((earned / available) * totalPoints(points)) : null;
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

export function shiftDate(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type PersonFlags = {
  thrive: boolean;
  form: boolean;
  serveClass: boolean;
  serving: boolean;
  tcCollege: boolean;
  giving: boolean;
  leadership: boolean;
};

export const NO_FLAGS: PersonFlags = { thrive: false, form: false, serveClass: false, serving: false, tcCollege: false, giving: false, leadership: false };

// One person's facts from their synced fields (form / TC College come from
// elsewhere and are filled in by loadEngagementContext).
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
    ...NO_FLAGS,
    thrive: yesLike(get(keys.thrive)),
    serveClass: yesLike(get(keys.serveClass)),
    serving: !!lastServed && lastServed >= shiftDate(asOf, -servingWindowDays) && lastServed <= shiftDate(asOf, 1),
    giving: yesLike(get(keys.giving)),
    leadership: yesLike(get(keys.leadership)),
  };
}

// Which parts have a data source set up. Transform always does (a person or
// group without attendance just has no value for it).
export type PartAvailability = Record<EngagementPart, boolean>;

export function partAvailability(keys: EngagementFieldKeys, tcCollegeTracked: boolean): PartAvailability {
  return {
    formThrive: true, // forms are synced for everyone; Thrive field optional
    transform: true,
    serving: !!keys.lastServed,
    tcCollege: tcCollegeTracked,
    giving: !!keys.giving,
    leadership: !!keys.leadership,
    serveClass: !!keys.serveClass,
  };
}

export type ScoredPerson = { personId: string; attendanceRate: number | null };

export type EngagementSummary = {
  people: number;
  percentages: EngagementPercentages;
  score: number | null;
};

// Percentages + score for a set of people. People without a profile (not
// synced yet) count as "not yet" for every part except Transform.
export function summarizeEngagement(
  people: ScoredPerson[],
  flags: Map<string, PersonFlags>,
  points: EngagementPoints,
  available: PartAvailability,
): EngagementSummary {
  const rates = people.map((person) => person.attendanceRate).filter((rate): rate is number => rate !== null && Number.isFinite(rate));
  const share = (part: EngagementPart, pick: (value: PersonFlags) => boolean) =>
    available[part] && people.length
      ? people.filter((person) => pick(flags.get(person.personId) ?? NO_FLAGS)).length / people.length
      : null;
  const percentages: EngagementPercentages = {
    formThrive: share("formThrive", (value) => value.thrive || value.form),
    transform: rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null,
    serving: share("serving", (value) => value.serving),
    tcCollege: share("tcCollege", (value) => value.tcCollege),
    giving: share("giving", (value) => value.giving),
    leadership: share("leadership", (value) => value.leadership),
    serveClass: share("serveClass", (value) => value.serveClass),
  };
  return { people: people.length, percentages, score: engagementScore(percentages, points) };
}

// Which synced field holds each fact: the saved choice if it's still synced,
// else (Thrive / Serve Class / Last Served only) the first synced field whose
// label matches.
export function resolveFieldKeys(saved: Partial<EngagementFieldKeys> | undefined, synced: SelectedPeopleField[]): EngagementFieldKeys {
  const syncedKeys = new Set(synced.map((field) => field.key));
  const chosen = (choice: string | null | undefined) => (choice && syncedKeys.has(choice) ? choice : null);
  const pick = (choice: string | null | undefined, pattern: RegExp) =>
    chosen(choice) ?? synced.find((field) => pattern.test(field.label))?.key ?? null;
  return {
    thrive: pick(saved?.thrive, /thrive/i),
    serveClass: pick(saved?.serveClass, /serve\s*class/i),
    lastServed: pick(saved?.lastServed, /last\s*serv/i),
    giving: chosen(saved?.giving),
    leadership: chosen(saved?.leadership),
  };
}

// ── Settings (settings table, key "engagement_settings"; no migration) ─────

export type TrackedItemKind = "checkins_event" | "group" | "group_type";
// transform: counts toward the Transform part; tc_college: attending it
// earns the TC College part (2026-11-10).
export type TrackedItemRole = "transform" | "tc_college";
export type TrackedItem = { kind: TrackedItemKind; id: string; name: string; role: TrackedItemRole };

// Each person's score sorts them into green / yellow / red: green = score >=
// green, yellow = score >= yellow, else red. In points (out of the total).
export type EngagementTiers = { green: number; yellow: number };
export const DEFAULT_TIERS: EngagementTiers = { green: 12, yellow: 7 };
export const DEFAULT_MISSED_GIVING_DAYS = 35;

export function normalizeTiers(raw: unknown, maxPoints: number): EngagementTiers {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const green = round1(Number(source.green));
  const yellow = round1(Number(source.yellow));
  if (!Number.isFinite(green) || !Number.isFinite(yellow) || green <= 0 || green > maxPoints || yellow <= 0 || yellow >= green) {
    const fallback = { ...DEFAULT_TIERS };
    return fallback.green <= maxPoints ? fallback : { green: round1(maxPoints * 0.7), yellow: round1(maxPoints * 0.4) };
  }
  return { green, yellow };
}

export type EngagementSettings = {
  points: EngagementPoints;
  fields: Partial<EngagementFieldKeys>;
  servingWindowDays: number;
  tiers: EngagementTiers;
  // A Giving field holding a date (last gift) counts as "missed" once that
  // date is more than this many days old.
  missedGivingDays: number;
  // Planning Center form ids whose submissions don't earn Form / Thrive
  // (staff reports, prayer requests...).
  excludedFormIds: string[];
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
    items.push({
      kind,
      id,
      name: String(source.name ?? "").trim().slice(0, 120) || id,
      role: source.role === "tc_college" ? "tc_college" : "transform",
    });
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
  // "points" replaced the old 0-100 "weights" on 2026-11-10; old weights are
  // ignored so everyone starts on the 17-point defaults.
  const points = normalizePoints(source.points);
  return {
    points,
    fields: {
      thrive: fieldKey(fields.thrive),
      serveClass: fieldKey(fields.serveClass),
      lastServed: fieldKey(fields.lastServed),
      giving: fieldKey(fields.giving),
      leadership: fieldKey(fields.leadership),
    },
    servingWindowDays: Number.isInteger(window) && window >= 7 && window <= 365 ? window : DEFAULT_SERVING_WINDOW_DAYS,
    tiers: normalizeTiers(source.tiers, totalPoints(points)),
    missedGivingDays: Number.isInteger(Number(source.missedGivingDays)) && Number(source.missedGivingDays) >= 7 && Number(source.missedGivingDays) <= 365
      ? Number(source.missedGivingDays)
      : DEFAULT_MISSED_GIVING_DAYS,
    excludedFormIds: Array.isArray(source.excludedFormIds)
      ? [...new Set(source.excludedFormIds.map((id: unknown) => String(id)).filter((id: string) => /^\d{1,20}$/.test(id)))].slice(0, 200) as string[]
      : [],
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

// ── Loading everything a score needs ────────────────────────────────────────

const CHUNK = 1000;

// Everyone who checked in at a tracked TC College item in the 26 weeks
// ending with asOf's week; null when no TC College item is tracked.
export async function loadTcCollegePeople(items: TrackedItem[], asOf: string): Promise<Set<string> | null> {
  const tc = items.filter((item) => item.role === "tc_college");
  if (!tc.length) return null;
  const people = new Set<string>();
  for (const item of tc) {
    const rows = await db.select({ personId: engagementAttendanceTable.personId })
      .from(engagementAttendanceTable)
      .where(and(
        eq(engagementAttendanceTable.itemKind, item.kind),
        eq(engagementAttendanceTable.itemId, item.id),
        gte(engagementAttendanceTable.weekStart, shiftDate(asOf, -7 * TC_COLLEGE_LOOKBACK_WEEKS)),
        lte(engagementAttendanceTable.weekStart, asOf),
      ));
    for (const row of rows) people.add(row.personId);
  }
  return people;
}

export type EngagementContext = {
  flags: Map<string, PersonFlags>;
  available: PartAvailability;
  points: EngagementPoints;
  maxPoints: number;
  keys: EngagementFieldKeys;
};

// Flags for these people as of `asOf` (a date), from their profiles, form
// submissions and TC College check-ins.
export async function loadEngagementContext(
  settings: EngagementSettings,
  synced: SelectedPeopleField[],
  personIds: string[],
  asOf: string,
): Promise<EngagementContext> {
  const keys = resolveFieldKeys(settings.fields, synced);
  const ids = [...new Set(personIds.filter(Boolean))];
  const tcCollege = await loadTcCollegePeople(settings.dashboard.items, asOf);
  const { loadFormSubmitters } = await import("./engagementForms");
  const submitters = await loadFormSubmitters(ids, settings.excludedFormIds);
  const flags = new Map<string, PersonFlags>();
  for (let index = 0; index < ids.length; index += CHUNK) {
    const rows = await db.select({ personId: peopleProfilesTable.personId, fields: peopleProfilesTable.fields })
      .from(peopleProfilesTable)
      .where(inArray(peopleProfilesTable.personId, ids.slice(index, index + CHUNK)));
    for (const row of rows) flags.set(row.personId, personFlags(row.fields, keys, asOf, settings.servingWindowDays));
  }
  for (const id of ids) {
    const form = submitters.has(id);
    const tc = tcCollege?.has(id) ?? false;
    if (!form && !tc) continue;
    flags.set(id, { ...(flags.get(id) ?? NO_FLAGS), form, tcCollege: tc });
  }
  return {
    flags,
    available: partAvailability(keys, tcCollege !== null),
    points: settings.points,
    maxPoints: totalPoints(settings.points),
    keys,
  };
}
