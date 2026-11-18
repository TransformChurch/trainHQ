// Check-In masters (2026-11-18): one named "master" that joins many
// Check-Ins events, e.g. "Thrive Master" over the ~100 three-week Thrive
// class events. Andrew's choices: an admin sets include terms (the event
// name contains any) and exclude terms (and none of these); at the end of
// each month a search finds new matching events, and they wait in the
// master's "pending" list until an admin approves them. Admins are emailed
// when new matches are found (routes/checkinMasters.ts).
//
// Masters can be used on the Engagement dashboard (item kind
// checkins_master), in Check-Ins reports and scheduled reports (event id
// token "master:<id>"), and in the Attendance history CSV.
//
// Stored as JSON in the settings table (key "checkin_masters"); no
// migration. Planning Center is only read.
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type MasterEvent = { id: string; name: string };
export type PendingEvent = MasterEvent & { foundAt: string; archived: boolean };
export type CheckinMaster = {
  id: string;
  name: string;
  includeTerms: string[];
  excludeTerms: string[];
  events: MasterEvent[];
  // Found by the monthly search, waiting for an admin to approve.
  pending: PendingEvent[];
  // Matches an admin turned down; never suggested again.
  dismissedIds: string[];
  createdAt: string;
  updatedAt: string;
};
export type MasterSearchRun = {
  startedAt: string;
  finishedAt: string | null;
  trigger: "scheduled" | "manual";
  status: "running" | "success" | "error";
  found: { masterId: string; masterName: string; events: MasterEvent[] }[];
  emailedTo: string[];
  message?: string;
};
export type MastersState = {
  masters: CheckinMaster[];
  nextId: number;
  // Whose Planning Center connection the monthly search uses (the admin who
  // last saved a master).
  ownerUserId: string | null;
  lastRun: MasterSearchRun | null;
};

const SETTINGS_KEY = "checkin_masters";
export const MAX_MASTERS = 50;
export const MAX_MASTER_EVENTS = 500;
const PCO_ID = /^\d{1,20}$/;
export const MASTER_TOKEN = /^master:(\d{1,9})$/;
export const masterToken = (id: string) => `master:${id}`;

export function cleanTerms(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const entry of list) {
    const term = String(entry ?? "").trim().slice(0, 60);
    if (!term || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    terms.push(term);
    if (terms.length >= 20) break;
  }
  return terms;
}

function cleanEvents(raw: unknown, max = MAX_MASTER_EVENTS): MasterEvent[] {
  const seen = new Set<string>();
  const events: MasterEvent[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    const id = String(source.id ?? "").trim();
    if (!PCO_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    events.push({ id, name: String(source.name ?? "").trim().slice(0, 200) || `Event ${id}` });
    if (events.length >= max) break;
  }
  return events;
}

export function normalizeMaster(raw: unknown): CheckinMaster | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const id = String(source.id ?? "").trim();
  if (!/^\d{1,9}$/.test(id)) return null;
  const events = cleanEvents(source.events);
  const inMaster = new Set(events.map((event) => event.id));
  const pending: PendingEvent[] = cleanEvents(source.pending)
    .filter((event) => !inMaster.has(event.id))
    .map((event) => {
      const original = (source.pending as Record<string, unknown>[]).find((entry) => String(entry?.id) === event.id) ?? {};
      return { ...event, foundAt: String(original.foundAt ?? "") || new Date(0).toISOString(), archived: original.archived === true };
    });
  const now = new Date().toISOString();
  return {
    id,
    name: String(source.name ?? "").trim().slice(0, 120) || `Master ${id}`,
    includeTerms: cleanTerms(source.includeTerms),
    excludeTerms: cleanTerms(source.excludeTerms),
    events,
    pending,
    dismissedIds: [...new Set((Array.isArray(source.dismissedIds) ? source.dismissedIds : []).map(String).filter((value) => PCO_ID.test(value)))],
    createdAt: String(source.createdAt ?? "") || now,
    updatedAt: String(source.updatedAt ?? "") || now,
  };
}

export function normalizeState(raw: unknown): MastersState {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const masters = (Array.isArray(source.masters) ? source.masters : [])
    .map(normalizeMaster)
    .filter((master): master is CheckinMaster => !!master)
    .slice(0, MAX_MASTERS);
  const highest = masters.reduce((max, master) => Math.max(max, Number(master.id)), 0);
  const nextId = Math.max(Number(source.nextId) || 1, highest + 1);
  return {
    masters,
    nextId,
    ownerUserId: typeof source.ownerUserId === "string" && source.ownerUserId ? source.ownerUserId : null,
    lastRun: source.lastRun && typeof source.lastRun === "object" ? source.lastRun as MasterSearchRun : null,
  };
}

export async function readMasters(): Promise<MastersState> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, SETTINGS_KEY)).limit(1);
  try {
    return normalizeState(rows[0] ? JSON.parse(rows[0].value) : {});
  } catch {
    return normalizeState({});
  }
}

export async function writeMasters(state: MastersState): Promise<void> {
  const value = JSON.stringify(state);
  await db.insert(settingsTable).values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

// Name contains any include term and none of the exclude terms (case-
// insensitive). No include terms = matches nothing.
export function matchesTerms(name: string, includeTerms: string[], excludeTerms: string[]): boolean {
  const value = name.toLowerCase();
  if (!includeTerms.some((term) => value.includes(term.toLowerCase()))) return false;
  return !excludeTerms.some((term) => value.includes(term.toLowerCase()));
}

type ListedEvent = { id: string; name: string; archived: boolean };

// Events matching the master's terms that it doesn't have, isn't waiting
// on and wasn't told to skip.
export function newMatches(master: CheckinMaster, events: ListedEvent[]): ListedEvent[] {
  const known = new Set([...master.events.map((event) => event.id), ...master.pending.map((event) => event.id), ...master.dismissedIds]);
  return events.filter((event) => !known.has(event.id) && matchesTerms(event.name, master.includeTerms, master.excludeTerms));
}

// The monthly search: adds new matches to each master's pending list.
// Returns what was found per master (masters with nothing new left out).
export function findPending(state: MastersState, events: ListedEvent[], now: Date): MasterSearchRun["found"] {
  const found: MasterSearchRun["found"] = [];
  for (const master of state.masters) {
    const matches = newMatches(master, events);
    if (!matches.length) continue;
    const room = Math.max(0, MAX_MASTER_EVENTS - master.events.length - master.pending.length);
    const added = matches.slice(0, room).map((event) => ({ id: event.id, name: event.name, archived: event.archived, foundAt: now.toISOString() }));
    if (!added.length) continue;
    master.pending.push(...added);
    master.updatedAt = now.toISOString();
    found.push({ masterId: master.id, masterName: master.name, events: added.map(({ id, name }) => ({ id, name })) });
  }
  return found;
}

// Approve (move pending -> events) or dismiss (pending -> dismissedIds).
export function resolvePending(master: CheckinMaster, eventIds: string[], approve: boolean, now: Date = new Date()): number {
  const picked = new Set(eventIds);
  const moving = master.pending.filter((event) => picked.has(event.id));
  if (!moving.length) return 0;
  master.pending = master.pending.filter((event) => !picked.has(event.id));
  if (approve) {
    const have = new Set(master.events.map((event) => event.id));
    for (const event of moving) {
      if (!have.has(event.id) && master.events.length < MAX_MASTER_EVENTS) master.events.push({ id: event.id, name: event.name });
    }
  } else {
    master.dismissedIds = [...new Set([...master.dismissedIds, ...moving.map((event) => event.id)])];
  }
  master.updatedAt = now.toISOString();
  return moving.length;
}

// ── Using masters elsewhere ────────────────────────────────────────────────

export type DatedEvent = { id: string; createdAt: string | null; archivedAt: string | null };

// Did the event exist at some point in [since, until)? (YYYY-MM-DD; same rule
// as groupActiveInRange.) Unknown dates count as active.
export function eventActiveInRange(event: Pick<DatedEvent, "createdAt" | "archivedAt">, since: string, until: string): boolean {
  if (event.createdAt && event.createdAt.slice(0, 10) >= until) return false;
  if (event.archivedAt && event.archivedAt.slice(0, 10) < since) return false;
  return true;
}

// A master's event ids, keeping only those that existed in [since, until)
// when dates are known (events missing from `dated` are kept).
export function masterEventIdsInRange(master: CheckinMaster, dated: DatedEvent[] | null, since: string, until: string): string[] {
  const byId = new Map((dated ?? []).map((event) => [event.id, event]));
  return master.events
    .filter((event) => {
      const info = byId.get(event.id);
      return !info || eventActiveInRange(info, since, until);
    })
    .map((event) => event.id);
}

// Splits a list of event ids / "master:<id>" tokens.
export function splitMasterTokens(ids: string[]): { eventIds: string[]; masterIds: string[] } {
  const eventIds: string[] = [];
  const masterIds: string[] = [];
  for (const id of ids) {
    const match = MASTER_TOKEN.exec(id);
    if (match) masterIds.push(match[1]);
    else eventIds.push(id);
  }
  return { eventIds, masterIds };
}
