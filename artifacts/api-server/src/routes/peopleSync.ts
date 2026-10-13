// Planning Center people sync: keeps a local copy of People profiles in
// people_profiles (lib/db/src/schema/people.ts) so reports can join
// attendance (stored by Planning Center person id) to who someone is --
// campus, grade, membership, baptism or any other custom field -- without
// calling Planning Center for every report.
//
// Read-only against Planning Center. One full pull pages through
// GET /people/v2/people (100 per request) with primary_campus and, when any
// custom field is picked, field_data included -- so custom fields cost no
// extra requests. Runs weekly from the Worker's Cron Trigger (Mondays 05:00
// UTC, before the attendance syncs) once an admin turns it on, or on demand
// with "Pull now". Which extra columns are pulled is chosen in the
// "Planning Center people sync" card on the Reporting page and stored in the
// settings row below; they land in people_profiles.fields (jsonb), so adding
// a column never needs a migration.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, peopleProfilesTable, settingsTable } from "@workspace/db";
import { and, asc, count, eq, isNotNull, isNull, lt, max, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { getValidPlanningCenterAccessToken } from "../lib/planningCenter";
import { authorizeScheduledCall, recordScheduledJob } from "../lib/scheduledJobs";
import {
  BUILT_IN_PEOPLE_FIELDS,
  buildPeopleCsv,
  buildProfileRows,
  customFieldId,
  effectiveFields,
  normalizeSelectedFields,
  resolveStandardFields,
  safeNextLink,
  type SelectedPeopleField,
  type StandardFieldResolution,
} from "../lib/peopleSync";
import { type JsonApiResource, planningCenterRequest } from "./reports";

const router: IRouter = Router();

const PEOPLE_BASE = "https://api.planningcenteronline.com/people/v2";
const SETTINGS_KEY = "people_sync";
const PAGE_DELAY_MS = 250;

type PeopleSyncRun = {
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "success" | "error";
  trigger: "manual" | "scheduled";
  pages: number;
  people: number;
  removed: number;
  message?: string;
  missingStandard?: string[];
};

type PeopleSyncSettings = {
  enabled: boolean;
  userId: string | null;
  fields: SelectedPeopleField[];
  // Which Planning Center field each standard column matched on the last
  // field lookup (null key = no field with that name).
  standard: StandardFieldResolution[] | null;
  lastRun: PeopleSyncRun | null;
};

function sendError(req: Request, res: Response, error: unknown, fallback: string) {
  const typed = error as Error & { status?: number; details?: string };
  req.log.error({ err: error, details: typed.details }, fallback);
  res.status(typed.status ?? 500).json({ error: typed.message || fallback });
}

export async function readPeopleSync(): Promise<PeopleSyncSettings> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, SETTINGS_KEY)).limit(1);
  try {
    const parsed = rows[0] ? JSON.parse(rows[0].value) : {};
    return {
      enabled: parsed.enabled === true,
      userId: typeof parsed.userId === "string" ? parsed.userId : null,
      fields: normalizeSelectedFields(parsed.fields),
      standard: Array.isArray(parsed.standard) ? parsed.standard : null,
      lastRun: parsed.lastRun ?? null,
    };
  } catch {
    return { enabled: false, userId: null, fields: [], standard: null, lastRun: null };
  }
}

async function writePeopleSync(settings: PeopleSyncSettings): Promise<void> {
  const value = JSON.stringify(settings);
  await db.insert(settingsTable).values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

type FieldDefinition = { id: string; name: string; tab: string; dataType: string | null };

// Every (non-deleted) custom field in Planning Center People, read-only.
export async function listFieldDefinitions(accessToken: string): Promise<FieldDefinition[]> {
  const definitions: JsonApiResource[] = [];
  const tabs = new Map<string, string>();
  let next: string | null = `${PEOPLE_BASE}/field_definitions?per_page=100&include=tab`;
  const visited = new Set<string>();
  while (next && !visited.has(next)) {
    visited.add(next);
    const page = await planningCenterRequest(next, accessToken) as { data?: JsonApiResource[]; included?: JsonApiResource[]; links?: { next?: unknown } };
    definitions.push(...(page.data ?? []));
    for (const resource of page.included ?? []) {
      if (resource.type === "Tab" && typeof resource.attributes?.name === "string") tabs.set(resource.id, resource.attributes.name);
    }
    next = safeNextLink(page.links?.next);
  }
  return definitions
    .filter((definition) => !definition.attributes?.deleted_at)
    .map((definition) => {
      const name = definition.attributes?.name;
      const tabId = definition.relationships?.tab?.data?.id;
      return {
        id: definition.id,
        name: typeof name === "string" && name.trim() ? name.trim() : `Custom field ${definition.id}`,
        tab: (tabId && tabs.get(tabId)) || "Other",
        dataType: typeof definition.attributes?.data_type === "string" ? definition.attributes.data_type : null,
      };
    });
}

// Merges the run into whatever settings are stored now, so an admin saving
// field choices mid-run isn't overwritten.
async function saveRun(run: PeopleSyncRun): Promise<void> {
  const current = await readPeopleSync();
  await writePeopleSync({ ...current, lastRun: run });
}

function peopleError(error: unknown): string {
  const typed = error as Error & { status?: number };
  if (typed?.status === 403) return "Planning Center People access is missing. Reconnect Church Center and approve People access.";
  return typed instanceof Error ? typed.message : String(error);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let syncRunning = false;

export function isPeopleSyncRunning(): boolean {
  return syncRunning;
}

// One full pull. Upserts each page as it arrives; only after the last page
// succeeds are people no longer in Planning Center marked removed (a failed
// run never marks anyone removed).
export async function runPeopleSync(
  userId: string,
  trigger: PeopleSyncRun["trigger"],
  getToken: (userId: string) => Promise<string> = getValidPlanningCenterAccessToken,
  delayMs: number = PAGE_DELAY_MS,
): Promise<PeopleSyncRun> {
  const startedAtDate = new Date();
  const run: PeopleSyncRun = { startedAt: startedAtDate.toISOString(), finishedAt: null, status: "running", trigger, pages: 0, people: 0, removed: 0 };
  if (syncRunning) return { ...run, finishedAt: run.startedAt, status: "error", message: "A people sync is already running." };
  syncRunning = true;
  try {
    await saveRun(run);
    // Re-match the standard columns by name on every pull, so a field
    // created or renamed in Planning Center is picked up automatically.
    const standard = resolveStandardFields(await listFieldDefinitions(await getToken(userId)));
    const current = await readPeopleSync();
    await writePeopleSync({ ...current, standard });
    const missing = standard.filter((field) => !field.key).map((field) => field.label);
    if (missing.length) run.missingStandard = missing;
    const fields = effectiveFields(standard, current.fields);
    const includes = ["primary_campus", "addresses", ...(fields.some((field) => customFieldId(field.key)) ? ["field_data"] : [])];
    let next: string | null = `${PEOPLE_BASE}/people?per_page=100&include=${includes.join(",")}`;
    const visited = new Set<string>();
    while (next && !visited.has(next)) {
      visited.add(next);
      const page = await planningCenterRequest(next, await getToken(userId)) as {
        data?: JsonApiResource[];
        included?: JsonApiResource[];
        links?: { next?: unknown };
      };
      const rows = buildProfileRows(page, fields);
      if (rows.length) {
        const syncedAt = new Date();
        await db.insert(peopleProfilesTable)
          .values(rows.map((row) => ({ ...row, syncedAt, removedAt: null })))
          .onConflictDoUpdate({
            target: peopleProfilesTable.personId,
            set: {
              firstName: sql`excluded.first_name`,
              lastName: sql`excluded.last_name`,
              birthdate: sql`excluded.birthdate`,
              gender: sql`excluded.gender`,
              grade: sql`excluded.grade`,
              child: sql`excluded.child`,
              membership: sql`excluded.membership`,
              status: sql`excluded.status`,
              campusId: sql`excluded.campus_id`,
              campusName: sql`excluded.campus_name`,
              city: sql`excluded.city`,
              state: sql`excluded.state`,
              zip: sql`excluded.zip`,
              pcoCreatedAt: sql`excluded.pco_created_at`,
              pcoUpdatedAt: sql`excluded.pco_updated_at`,
              fields: sql`excluded.fields`,
              syncedAt: sql`excluded.synced_at`,
              removedAt: sql`NULL`,
            },
          });
      }
      run.pages += 1;
      run.people += rows.length;
      if (run.pages % 5 === 0) await saveRun(run);
      next = safeNextLink(page.links?.next);
      if (next) await sleep(delayMs);
    }
    const removed = await db.update(peopleProfilesTable)
      .set({ removedAt: new Date() })
      .where(and(lt(peopleProfilesTable.syncedAt, startedAtDate), isNull(peopleProfilesTable.removedAt)))
      .returning({ personId: peopleProfilesTable.personId });
    run.removed = removed.length;
    run.status = "success";
  } catch (error) {
    run.status = "error";
    run.message = peopleError(error);
    logger.error({ err: error }, "People sync failed");
  } finally {
    run.finishedAt = new Date().toISOString();
    syncRunning = false;
    await saveRun(run).catch((error) => logger.error({ err: error }, "Failed to save people sync status"));
  }
  return run;
}

async function profileSummary() {
  const [row] = await db.select({
    people: count(),
    lastSyncedAt: max(peopleProfilesTable.syncedAt),
  }).from(peopleProfilesTable).where(isNull(peopleProfilesTable.removedAt));
  const [removed] = await db.select({ removed: count() }).from(peopleProfilesTable).where(isNotNull(peopleProfilesTable.removedAt));
  return { people: row?.people ?? 0, removed: removed?.removed ?? 0, lastSyncedAt: row?.lastSyncedAt ?? null };
}

// ── GET /api/people-sync/settings ───────────────────────────────────────────
router.get("/settings", requireAdmin, async (req, res) => {
  try {
    const settings = await readPeopleSync();
    res.json({
      enabled: settings.enabled,
      fields: settings.fields,
      standard: settings.standard,
      lastRun: settings.lastRun,
      running: syncRunning,
      usesYourConnection: settings.userId === res.locals.dbUser.id,
      summary: await profileSummary(),
    });
  } catch (error) {
    sendError(req, res, error, "Failed to load people sync settings");
  }
});

// ── POST /api/people-sync/settings ──────────────────────────────────────────
// Body: { fields?: {key,label}[], enabled?: boolean }. Turning the weekly
// sync on makes it use the signed-in admin's Planning Center connection.
router.post("/settings", requireAdmin, async (req, res) => {
  try {
    const current = await readPeopleSync();
    const fields = req.body?.fields !== undefined ? normalizeSelectedFields(req.body.fields) : current.fields;
    const enabled = typeof req.body?.enabled === "boolean" ? req.body.enabled : current.enabled;
    const userId = enabled && (!current.enabled || !current.userId) ? res.locals.dbUser.id : current.userId;
    await writePeopleSync({ ...current, fields, enabled, userId });
    res.json({ enabled, fields, standard: current.standard, lastRun: current.lastRun, running: syncRunning, usesYourConnection: userId === res.locals.dbUser.id, summary: await profileSummary() });
  } catch (error) {
    sendError(req, res, error, "Failed to save people sync settings");
  }
});

// ── GET /api/people-sync/available-fields ───────────────────────────────────
// The built-in extras plus every custom field defined in Planning Center
// People (read-only), grouped by the tab they live on.
router.get("/available-fields", requireAdmin, async (req, res) => {
  try {
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    const definitions = await listFieldDefinitions(accessToken);
    const standard = resolveStandardFields(definitions);
    // Keep the stored match current so the card's standard chips are right
    // even before the next pull.
    const current = await readPeopleSync();
    await writePeopleSync({ ...current, standard });
    const standardKeys = new Set(standard.map((field) => field.key).filter((key): key is string => !!key));
    const custom = definitions
      .map((definition) => ({
        key: `field:${definition.id}`,
        label: definition.name,
        tab: definition.tab,
        dataType: definition.dataType,
        standard: standardKeys.has(`field:${definition.id}`),
      }))
      .sort((a, b) => a.tab.localeCompare(b.tab) || a.label.localeCompare(b.label));
    res.json({ builtIn: BUILT_IN_PEOPLE_FIELDS.map(({ key, label }) => ({ key, label })), custom, standard });
  } catch (error) {
    const typed = error as Error & { status?: number };
    if (typed.status === 403) {
      res.status(403).json({ error: peopleError(error) });
      return;
    }
    sendError(req, res, error, "Failed to load Planning Center fields");
  }
});

// ── POST /api/people-sync/run ───────────────────────────────────────────────
// "Pull now": starts a full pull in the background with the signed-in
// admin's connection and returns right away; the card polls /settings for
// progress (which also keeps the container awake while it runs).
router.post("/run", requireAdmin, async (req, res) => {
  if (syncRunning) {
    res.status(409).json({ error: "A people sync is already running." });
    return;
  }
  const userId = res.locals.dbUser.id as string;
  void runPeopleSync(userId, "manual").then((run) => {
    logger.info({ run }, "Manual people sync finished");
  });
  res.status(202).json({ started: true });
});

// ── POST /api/people-sync/run-scheduled ─────────────────────────────────────
// Called by the Worker's Monday Cron Trigger (src/worker.ts) with the
// Weekly Pulse's internal secret.
router.post("/run-scheduled", async (req, res) => {
  if (!(await authorizeScheduledCall(req, res, "people_sync"))) return;
  const settings = await readPeopleSync();
  if (!settings.enabled || !settings.userId) {
    await recordScheduledJob("people_sync", "skipped", "The weekly people sync is turned off in the Reporting page.");
    res.json({ skipped: true });
    return;
  }
  await recordScheduledJob("people_sync", "running");
  const run = await runPeopleSync(settings.userId, "scheduled");
  await recordScheduledJob(
    "people_sync",
    run.status !== "success" ? "error" : run.missingStandard?.length ? "partial" : "ok",
    run.status === "success"
      ? `${run.people} people synced, ${run.removed} marked removed${run.missingStandard?.length ? `. Not found in Planning Center: ${run.missingStandard.join(", ")}` : ""}`
      : run.message ?? "Failed.",
  );
  req.log.info({ run }, "Scheduled people sync finished");
  res.json(run);
});

// ── GET /api/people-sync/people.csv ─────────────────────────────────────────
// Everyone currently in the local copy, with the picked columns. Admin only.
router.get("/people.csv", requireAdmin, async (req, res) => {
  try {
    const settings = await readPeopleSync();
    const fields = effectiveFields(settings.standard ?? [], settings.fields);
    const rows = await db.select().from(peopleProfilesTable)
      .where(isNull(peopleProfilesTable.removedAt))
      .orderBy(asc(peopleProfilesTable.lastName), asc(peopleProfilesTable.firstName));
    req.log.info({ rows: rows.length, admin: res.locals.dbUser.id }, "People CSV downloaded");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="planning-center-people.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.send("﻿" + buildPeopleCsv(rows, fields));
  } catch (error) {
    sendError(req, res, error, "Failed to download people");
  }
});

export default router;
