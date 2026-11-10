// Engagement dashboard "People" view (Andrew, 2026-11-10): every person who
// attended a tracked group / event gets their own engagement score and a
// green / yellow / red tier, saved as a weekly snapshot after the Monday sync
// so drops (green -> yellow, yellow -> red, green -> red) and giving changes
// can be flagged by name on the dashboard. Never emailed (Andrew's call).
//
// Who is scored: anyone present for any tracked item in the last
// LOOKBACK_WEEKS weeks, so people who stop coming slide to red instead of
// dropping out of the numbers.
//
// A person's score uses the same parts and weights as everything else
// (lib/engagement.ts), each 0 or 1 for one person except attendance:
//   attendance -- over the score window (the dashboard's default weeks):
//                 weeks present / weeks held, averaged over the tracked items
//                 they attended in the lookback (items with no held weeks in
//                 the window are skipped; none left = no attendance part)
//   thrive / serveClass / serving / giving -- their profile flags
//
// Giving flags use only the Giving field (no Planning Center Giving access):
//   canceled -- the field had a value at last week's snapshot, now empty
//   missed   -- the field holds a date that just went more than
//               missedGivingDays old (it wasn't overdue last week)
// They cover everyone with the Giving field, not just tracked attendees.
import { db, engagementAttendanceTable, engagementPersonSnapshotsTable, engagementWeeksTable, peopleProfilesTable } from "@workspace/db";
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { addDays, weekStartFor } from "./checkinsHistory";
import {
  engagementScore,
  loadPersonFlags,
  parseFieldDate,
  readEngagementSettings,
  resolveFieldKeys,
  yesLike,
  type EngagementTiers,
  type EngagementWeights,
  type PersonFlags,
} from "./engagement";
import { windowWeeks, type PresenceRow, type WeekRow } from "./engagementMetrics";
import { syncedFields } from "./reportPeople";

export const LOOKBACK_WEEKS = 26;
export const SNAPSHOT_RETAIN_WEEKS = 30;
export type Tier = "green" | "yellow" | "red";
const TIER_RANK: Record<Tier, number> = { green: 2, yellow: 1, red: 0 };

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

export function tierFor(score: number | null, tiers: EngagementTiers): Tier | null {
  if (score === null) return null;
  if (score >= tiers.green) return "green";
  if (score >= tiers.yellow) return "yellow";
  return "red";
}

export type ItemData = { key: string; weekRows: WeekRow[]; presence: PresenceRow[] };
export type PersonScore = { personId: string; attendance: number | null; score: number | null; items: string[] };

export function scorePeople(
  items: ItemData[],
  window: string[],
  lookback: string[],
  flags: Map<string, PersonFlags>,
  weights: EngagementWeights,
  givingTracked: boolean,
): PersonScore[] {
  const inWindow = new Set(window);
  const inLookback = new Set(lookback);
  const ratesByPerson = new Map<string, number[]>();
  const itemsByPerson = new Map<string, Set<string>>();
  for (const item of items) {
    const held = new Set(item.weekRows.filter((row) => inWindow.has(row.weekStart) && (row.attendees ?? 0) > 0).map((row) => row.weekStart));
    const lookbackPeople = new Set<string>();
    const presentWeeks = new Map<string, number>();
    for (const row of item.presence) {
      if (inLookback.has(row.weekStart)) lookbackPeople.add(row.personId);
      if (held.has(row.weekStart)) presentWeeks.set(row.personId, (presentWeeks.get(row.personId) ?? 0) + 1);
    }
    for (const personId of lookbackPeople) {
      itemsByPerson.set(personId, (itemsByPerson.get(personId) ?? new Set()).add(item.key));
      if (held.size) {
        ratesByPerson.set(personId, [...(ratesByPerson.get(personId) ?? []), Math.min(1, (presentWeeks.get(personId) ?? 0) / held.size)]);
      }
    }
  }
  return [...itemsByPerson.entries()].map(([personId, itemKeys]) => {
    const rates = ratesByPerson.get(personId) ?? [];
    const attendance = rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null;
    const flag = flags.get(personId);
    const score = engagementScore({
      attendance,
      thrive: flag?.thrive ? 1 : 0,
      serveClass: flag?.serveClass ? 1 : 0,
      serving: flag?.serving ? 1 : 0,
      giving: givingTracked ? (flag?.giving ? 1 : 0) : null,
    }, weights);
    return { personId, attendance, score, items: [...itemKeys].sort() };
  });
}

export type SnapshotRow = { personId: string; score: number | null; tier: string | null; givingHas: boolean; givingDate: string | null };

export function givingOverdue(givingDate: string | null, weekStart: string, missedDays: number): boolean {
  return !!givingDate && givingDate < addDays(addDays(weekStart, 6), -missedDays);
}

export type TierDrop = { personId: string; from: Tier; to: Tier; score: number | null; previousScore: number | null };
export type GivingFlag = { personId: string; kind: "canceled" | "missed"; givingDate: string | null; previousGivingDate: string | null };

// What changed between last week's snapshot and this week's.
export function compareSnapshots(
  current: SnapshotRow[],
  previous: SnapshotRow[],
  weekStart: string,
  previousWeekStart: string,
  missedDays: number,
): { drops: TierDrop[]; giving: GivingFlag[] } {
  const before = new Map(previous.map((row) => [row.personId, row]));
  const drops: TierDrop[] = [];
  const giving: GivingFlag[] = [];
  for (const row of current) {
    const prior = before.get(row.personId);
    if (!prior) continue;
    const from = prior.tier as Tier | null;
    const to = row.tier as Tier | null;
    if (from && to && TIER_RANK[to] < TIER_RANK[from]) {
      drops.push({ personId: row.personId, from, to, score: row.score, previousScore: prior.score });
    }
    if (prior.givingHas && !row.givingHas) {
      giving.push({ personId: row.personId, kind: "canceled", givingDate: null, previousGivingDate: prior.givingDate });
    } else if (row.givingHas && givingOverdue(row.givingDate, weekStart, missedDays)
      && !(prior.givingHas && givingOverdue(prior.givingDate, previousWeekStart, missedDays))) {
      giving.push({ personId: row.personId, kind: "missed", givingDate: row.givingDate, previousGivingDate: prior.givingDate });
    }
  }
  const order: Record<Tier, number> = { red: 0, yellow: 1, green: 2 };
  drops.sort((a, b) => order[a.to] - order[b.to] || (a.score ?? 0) - (b.score ?? 0));
  return { drops, giving };
}

// ── Weekly snapshot (after the Monday engagement sync) ─────────────────────

const CHUNK = 1000;

export async function takePeopleSnapshot(now: Date = new Date()): Promise<{ weekStart: string; scored: number; givers: number }> {
  const settings = await readEngagementSettings();
  const items = settings.dashboard.items;
  const lastWeek = addDays(weekStartFor(now.toISOString()), -7);
  const window = windowWeeks(lastWeek, settings.dashboard.defaultWeeks);
  const lookback = windowWeeks(lastWeek, LOOKBACK_WEEKS);
  const synced = await syncedFields();
  const keys = resolveFieldKeys(settings.fields, synced);
  const givingTracked = !!keys.giving;

  const earliest = lookback[0] < window[0] ? lookback[0] : window[0];
  const weekRows = items.length
    ? await db.select().from(engagementWeeksTable).where(gte(engagementWeeksTable.weekStart, earliest))
    : [];
  const presenceRows = items.length
    ? await db.select({
      itemKind: engagementAttendanceTable.itemKind,
      itemId: engagementAttendanceTable.itemId,
      weekStart: engagementAttendanceTable.weekStart,
      personId: engagementAttendanceTable.personId,
    }).from(engagementAttendanceTable).where(gte(engagementAttendanceTable.weekStart, earliest))
    : [];
  const itemData: ItemData[] = items.map((item) => ({
    key: `${item.kind}:${item.id}`,
    weekRows: weekRows.filter((row) => row.itemKind === item.kind && row.itemId === item.id) as WeekRow[],
    presence: presenceRows.filter((row) => row.itemKind === item.kind && row.itemId === item.id),
  }));
  const lookbackSet = new Set(lookback);
  const population = [...new Set(presenceRows.filter((row) => lookbackSet.has(row.weekStart)).map((row) => row.personId))];
  const flags = await loadPersonFlags(population, keys, addDays(lastWeek, 6), settings.servingWindowDays);
  const scores = scorePeople(itemData, window, lookback, flags, settings.weights, givingTracked);

  // Giving field state for everyone who has it now or had it last week.
  const givingState = new Map<string, { has: boolean; date: string | null }>();
  if (keys.giving) {
    const givingKey = keys.giving;
    const previousGivers = await db.select({ personId: engagementPersonSnapshotsTable.personId })
      .from(engagementPersonSnapshotsTable)
      .where(and(eq(engagementPersonSnapshotsTable.weekStart, addDays(lastWeek, -7)), eq(engagementPersonSnapshotsTable.givingHas, true)));
    const withField = await db.select({ personId: peopleProfilesTable.personId, fields: peopleProfilesTable.fields })
      .from(peopleProfilesTable)
      .where(and(isNull(peopleProfilesTable.removedAt), sql`${peopleProfilesTable.fields} ? ${givingKey}`));
    for (const row of withField) {
      const value = row.fields?.[givingKey];
      if (yesLike(value)) givingState.set(row.personId, { has: true, date: parseFieldDate(value) });
    }
    const check = [...new Set([...population, ...previousGivers.map((row) => row.personId)])].filter((id) => !givingState.has(id));
    for (let index = 0; index < check.length; index += CHUNK) {
      const rows = await db.select({ personId: peopleProfilesTable.personId, fields: peopleProfilesTable.fields })
        .from(peopleProfilesTable)
        .where(inArray(peopleProfilesTable.personId, check.slice(index, index + CHUNK)));
      for (const row of rows) {
        const value = row.fields?.[givingKey];
        givingState.set(row.personId, { has: yesLike(value), date: yesLike(value) ? parseFieldDate(value) : null });
      }
    }
    for (const row of previousGivers) if (!givingState.has(row.personId)) givingState.set(row.personId, { has: false, date: null });
  }

  const byPerson = new Map<string, typeof engagementPersonSnapshotsTable.$inferInsert>();
  for (const person of scores) {
    const giving = givingState.get(person.personId);
    byPerson.set(person.personId, {
      weekStart: lastWeek,
      personId: person.personId,
      score: person.score,
      tier: tierFor(person.score, settings.tiers),
      items: person.items.join(","),
      givingHas: giving?.has ?? false,
      givingDate: giving?.date ?? null,
    });
  }
  for (const [personId, giving] of givingState) {
    if (byPerson.has(personId)) continue;
    byPerson.set(personId, { weekStart: lastWeek, personId, score: null, tier: null, items: null, givingHas: giving.has, givingDate: giving.date });
  }
  const rows = [...byPerson.values()];
  await db.transaction(async (tx) => {
    await tx.delete(engagementPersonSnapshotsTable).where(eq(engagementPersonSnapshotsTable.weekStart, lastWeek));
    for (let index = 0; index < rows.length; index += 500) {
      await tx.insert(engagementPersonSnapshotsTable).values(rows.slice(index, index + 500));
    }
    await tx.delete(engagementPersonSnapshotsTable)
      .where(lt(engagementPersonSnapshotsTable.weekStart, addDays(lastWeek, -7 * SNAPSHOT_RETAIN_WEEKS)));
  });
  return { weekStart: lastWeek, scored: scores.length, givers: [...givingState.values()].filter((value) => value.has).length };
}

// ── Dashboard data ──────────────────────────────────────────────────────────

export type PeopleDashboard = {
  weekStart: string | null;          // latest snapshot (week it covers)
  previousWeekStart: string | null;  // the one compared against (null = first snapshot)
  tiers: EngagementTiers;
  scoreWeeks: number;
  counts: Record<Tier, number>;
  previousCounts: Record<Tier, number> | null;
  history: { weekStart: string; green: number; yellow: number; red: number }[];
  drops: (TierDrop & { name: string; items: string[] })[];
  giving: (GivingFlag & { name: string })[];
  givingField: string | null;
  missedGivingDays: number;
  tierList?: { personId: string; name: string; score: number | null; items: string[] }[];
};

function countTiers(rows: { tier: string | null }[]): Record<Tier, number> {
  const counts: Record<Tier, number> = { green: 0, yellow: 0, red: 0 };
  for (const row of rows) if (row.tier === "green" || row.tier === "yellow" || row.tier === "red") counts[row.tier] += 1;
  return counts;
}

async function namesFor(personIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(personIds)];
  for (let index = 0; index < ids.length; index += CHUNK) {
    const rows = await db.select({ personId: peopleProfilesTable.personId, firstName: peopleProfilesTable.firstName, lastName: peopleProfilesTable.lastName })
      .from(peopleProfilesTable)
      .where(inArray(peopleProfilesTable.personId, ids.slice(index, index + CHUNK)));
    for (const row of rows) names.set(row.personId, [row.firstName, row.lastName].filter(Boolean).join(" ") || `Person ${row.personId}`);
  }
  return names;
}

export async function buildPeopleDashboard(tierList?: Tier): Promise<PeopleDashboard> {
  const settings = await readEngagementSettings();
  const synced = await syncedFields();
  const keys = resolveFieldKeys(settings.fields, synced);
  const weekRows = await db.selectDistinct({ weekStart: engagementPersonSnapshotsTable.weekStart })
    .from(engagementPersonSnapshotsTable)
    .orderBy(desc(engagementPersonSnapshotsTable.weekStart))
    .limit(12);
  const weeks = weekRows.map((row) => row.weekStart);
  const base: PeopleDashboard = {
    weekStart: weeks[0] ?? null,
    previousWeekStart: null,
    tiers: settings.tiers,
    scoreWeeks: settings.dashboard.defaultWeeks,
    counts: { green: 0, yellow: 0, red: 0 },
    previousCounts: null,
    history: [],
    drops: [],
    giving: [],
    givingField: keys.giving ? synced.find((field) => field.key === keys.giving)?.label ?? keys.giving : null,
    missedGivingDays: settings.missedGivingDays,
  };
  if (!weeks.length) return base;
  const recent = await db.select({
    weekStart: engagementPersonSnapshotsTable.weekStart,
    personId: engagementPersonSnapshotsTable.personId,
    score: engagementPersonSnapshotsTable.score,
    tier: engagementPersonSnapshotsTable.tier,
    items: engagementPersonSnapshotsTable.items,
    givingHas: engagementPersonSnapshotsTable.givingHas,
    givingDate: engagementPersonSnapshotsTable.givingDate,
  }).from(engagementPersonSnapshotsTable).where(inArray(engagementPersonSnapshotsTable.weekStart, weeks));
  const byWeek = new Map<string, typeof recent>();
  for (const row of recent) byWeek.set(row.weekStart, [...(byWeek.get(row.weekStart) ?? []), row]);
  const current = byWeek.get(weeks[0]) ?? [];
  // Compare with the snapshot exactly one week earlier; a gap (a missed
  // Monday) means no flags rather than a misleading two-week jump.
  const previousWeek = weeks.find((week) => week === addDays(weeks[0], -7)) ?? null;
  const previous = previousWeek ? byWeek.get(previousWeek) ?? [] : [];
  const changes = previousWeek
    ? compareSnapshots(current, previous, weeks[0], previousWeek, settings.missedGivingDays)
    : { drops: [], giving: [] };
  const itemNames = new Map(settings.dashboard.items.map((item) => [`${item.kind}:${item.id}`, item.name]));
  const itemList = (value: string | null) => (value ? value.split(",").map((key) => itemNames.get(key) ?? key) : []);
  const listRows = tierList ? current.filter((row) => row.tier === tierList) : [];
  const names = await namesFor([
    ...changes.drops.map((drop) => drop.personId),
    ...changes.giving.map((flag) => flag.personId),
    ...listRows.map((row) => row.personId),
  ]);
  const currentById = new Map(current.map((row) => [row.personId, row]));
  return {
    ...base,
    previousWeekStart: previousWeek,
    counts: countTiers(current),
    previousCounts: previousWeek ? countTiers(previous) : null,
    history: [...weeks].reverse().map((week) => ({ weekStart: week, ...countTiers(byWeek.get(week) ?? []) })),
    drops: changes.drops.map((drop) => ({
      ...drop,
      name: names.get(drop.personId) ?? `Person ${drop.personId}`,
      items: itemList(currentById.get(drop.personId)?.items ?? null),
    })),
    giving: changes.giving.map((flag) => ({ ...flag, name: names.get(flag.personId) ?? `Person ${flag.personId}` })),
    ...(tierList ? {
      tierList: listRows
        .map((row) => ({ personId: row.personId, name: names.get(row.personId) ?? `Person ${row.personId}`, score: row.score, items: itemList(row.items) }))
        .sort((a, b) => (a.score ?? 0) - (b.score ?? 0) || a.name.localeCompare(b.name)),
    } : {}),
  };
}

// New cutoffs apply to every saved snapshot right away (from the stored
// scores), so this week and last week are always compared on the same scale.
export async function retierSnapshots(tiers: EngagementTiers): Promise<void> {
  await db.update(engagementPersonSnapshotsTable).set({
    tier: sql`case when ${engagementPersonSnapshotsTable.score} is null then null
      when ${engagementPersonSnapshotsTable.score} >= ${tiers.green} then 'green'
      when ${engagementPersonSnapshotsTable.score} >= ${tiers.yellow} then 'yellow'
      else 'red' end`,
  });
}
