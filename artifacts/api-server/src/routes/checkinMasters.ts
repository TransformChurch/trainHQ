// Check-In masters and group masters (lib/checkinMasters.ts; kind
// "checkins" or "groups"), managed in Tool Management > Database.
//
//   GET    /api/checkin-masters                  (admin) masters + last search
//   GET    /api/checkin-masters/events           (admin) every Check-Ins event, for picking
//   POST   /api/checkin-masters/preview          (admin) events matching terms
//   POST   /api/checkin-masters                  (admin) create
//   PUT    /api/checkin-masters/:id              (admin) edit name, terms, events
//   DELETE /api/checkin-masters/:id              (admin)
//   POST   /api/checkin-masters/:id/approve      (admin) pending -> events
//   POST   /api/checkin-masters/:id/dismiss      (admin) pending -> never suggest again
//   POST   /api/checkin-masters/search-now       (admin) run the search now
//   POST   /api/checkin-masters/run-scheduled    Worker, last day of each month 9 PM ET
//
// The search reads Planning Center only (event lists). New matches wait for
// approval, and every admin with an email address gets one email listing them.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";
import { getValidPlanningCenterAccessToken } from "../lib/planningCenter";
import { authorizeScheduledCall, recordScheduledJob } from "../lib/scheduledJobs";
import { brandEmailHtml, emailButton, sendEmail, siteUrl } from "../lib/email";
import { logger } from "../lib/logger";
import {
  cleanTerms,
  findPending,
  matchesTerms,
  MAX_MASTER_EVENTS,
  MAX_MASTERS,
  normalizeMaster,
  readMasters,
  resolvePending,
  writeMasters,
  type CheckinMaster,
  type MasterSearchRun,
  type MastersState,
} from "../lib/checkinMasters";
import { listCheckInsEvents, type CheckInsEvent } from "./attendanceHistory";
import { listGroups, type GroupInfo } from "./groupHistory";
import type { MasterKind } from "../lib/checkinMasters";

const kindOf = (value: unknown): MasterKind => (value === "groups" ? "groups" : "checkins");
async function listFor(kind: MasterKind, accessToken: string): Promise<(CheckInsEvent | GroupInfo)[]> {
  return kind === "groups" ? listGroups(accessToken) : listCheckInsEvents(accessToken);
}

const router: IRouter = Router();

function sendError(req: Request, res: Response, error: unknown, fallback: string) {
  const typed = error as Error & { status?: number };
  req.log.error({ err: error }, fallback);
  res.status(typed.status && typed.status < 600 ? typed.status : 500).json({ error: typed.message || fallback });
}

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);

function masterView(master: CheckinMaster) {
  return { ...master, eventCount: master.events.length, pendingCount: master.pending.length };
}

router.get("/", requireAdmin, async (req, res) => {
  try {
    const state = await readMasters();
    res.json({ masters: state.masters.map(masterView), lastRun: state.lastRun, ownerUserId: state.ownerUserId });
  } catch (error) {
    sendError(req, res, error, "Failed to load Check-In masters");
  }
});

router.get("/events", requireAdmin, async (req, res) => {
  try {
    res.json(await listFor(kindOf(req.query.kind), await getValidPlanningCenterAccessToken(res.locals.dbUser.id)));
  } catch (error) {
    sendError(req, res, error, "Failed to load Check-Ins events");
  }
});

// Every event (current and archived) whose name matches the terms; also
// says which master already has each one.
router.post("/preview", requireAdmin, async (req, res) => {
  try {
    const includeTerms = cleanTerms(req.body?.includeTerms);
    const excludeTerms = cleanTerms(req.body?.excludeTerms);
    if (!includeTerms.length) {
      res.json({ events: [] });
      return;
    }
    const kind = kindOf(req.body?.kind);
    const [events, state] = await Promise.all([
      listFor(kind, await getValidPlanningCenterAccessToken(res.locals.dbUser.id)),
      readMasters(),
    ]);
    const owner = new Map<string, string>();
    for (const master of state.masters.filter((entry) => entry.kind === kind)) for (const event of master.events) owner.set(event.id, master.name);
    res.json({
      events: events
        .filter((event) => matchesTerms(event.name, includeTerms, excludeTerms))
        .map((event) => ({ ...event, inMaster: owner.get(event.id) ?? null })),
    });
  } catch (error) {
    sendError(req, res, error, "Failed to search Check-Ins events");
  }
});

// Applies name/terms/events from the request to a master.
function applyEdits(master: CheckinMaster, body: Record<string, unknown>): string | null {
  if (body.name !== undefined) master.name = String(body.name ?? "").trim().slice(0, 120) || master.name;
  if (body.includeTerms !== undefined) master.includeTerms = cleanTerms(body.includeTerms);
  if (body.excludeTerms !== undefined) master.excludeTerms = cleanTerms(body.excludeTerms);
  if (body.events !== undefined) {
    const next = normalizeMaster({ ...master, events: body.events });
    if (!next) return "Invalid events.";
    master.events = next.events;
    const have = new Set(master.events.map((event) => event.id));
    master.pending = master.pending.filter((event) => !have.has(event.id));
  }
  if (!master.includeTerms.length) return "Add at least one search term.";
  return null;
}

router.post("/", requireAdmin, async (req, res) => {
  try {
    const state = await readMasters();
    if (state.masters.length >= MAX_MASTERS) {
      res.status(400).json({ error: `At most ${MAX_MASTERS} masters.` });
      return;
    }
    const now = new Date().toISOString();
    const master: CheckinMaster = {
      id: String(state.nextId), kind: kindOf(req.body?.kind), name: "", includeTerms: [], excludeTerms: [], events: [], pending: [], dismissedIds: [], createdAt: now, updatedAt: now,
    };
    const problem = applyEdits(master, { events: [], ...req.body });
    if (!master.name) master.name = master.includeTerms[0] ? `${master.includeTerms[0]} Master` : `Master ${master.id}`;
    if (problem) {
      res.status(400).json({ error: problem });
      return;
    }
    state.masters.push(master);
    state.nextId += 1;
    state.ownerUserId = res.locals.dbUser.id;
    await writeMasters(state);
    req.log.info({ actorId: res.locals.dbUser.id, masterId: master.id, events: master.events.length }, "Check-In master created");
    res.status(201).json({ master: masterView(master) });
  } catch (error) {
    sendError(req, res, error, "Failed to create the master");
  }
});

async function withMaster(req: Request, res: Response, change: (master: CheckinMaster, state: MastersState) => string | null | Promise<string | null>) {
  const state = await readMasters();
  const master = state.masters.find((entry) => entry.id === req.params.id);
  if (!master) {
    res.status(404).json({ error: "Master not found." });
    return;
  }
  const problem = await change(master, state);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  master.updatedAt = new Date().toISOString();
  state.ownerUserId = res.locals.dbUser.id;
  await writeMasters(state);
  res.json({ master: masterView(master) });
}

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    await withMaster(req, res, (master) => applyEdits(master, req.body ?? {}));
  } catch (error) {
    sendError(req, res, error, "Failed to save the master");
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const state = await readMasters();
    const before = state.masters.length;
    state.masters = state.masters.filter((master) => master.id !== req.params.id);
    if (state.masters.length === before) {
      res.status(404).json({ error: "Master not found." });
      return;
    }
    await writeMasters(state);
    res.json({ deleted: true });
  } catch (error) {
    sendError(req, res, error, "Failed to delete the master");
  }
});

const idList = (raw: unknown) => (Array.isArray(raw) ? raw : []).map((value) => String(value)).filter(Boolean);

router.post("/:id/approve", requireAdmin, async (req, res) => {
  try {
    await withMaster(req, res, (master) => {
      const ids = req.body?.all === true ? master.pending.map((event) => event.id) : idList(req.body?.eventIds);
      if (master.events.length + ids.length > MAX_MASTER_EVENTS) return `A master holds at most ${MAX_MASTER_EVENTS} events.`;
      return resolvePending(master, ids, true) ? null : "Nothing to approve.";
    });
  } catch (error) {
    sendError(req, res, error, "Failed to approve events");
  }
});

router.post("/:id/dismiss", requireAdmin, async (req, res) => {
  try {
    await withMaster(req, res, (master) => {
      const ids = req.body?.all === true ? master.pending.map((event) => event.id) : idList(req.body?.eventIds);
      return resolvePending(master, ids, false) ? null : "Nothing to dismiss.";
    });
  } catch (error) {
    sendError(req, res, error, "Failed to dismiss events");
  }
});

// ── The search ─────────────────────────────────────────────────────────────

export function approvalEmailHtml(found: MasterSearchRun["found"], link: string): string {
  const total = found.reduce((sum, entry) => sum + entry.events.length, 0);
  const sections = found.map((entry) => `
<h3 style="margin:20px 0 6px;font-size:16px;">${escape(entry.masterName)} &middot; ${entry.events.length} new ${entry.kind === "groups" ? `group${entry.events.length === 1 ? "" : "s"}` : `event${entry.events.length === 1 ? "" : "s"}`}</h3>
<ul style="margin:0;padding-left:20px;">${entry.events.map((event) => `<li>${escape(event.name)}</li>`).join("")}</ul>`).join("");
  return brandEmailHtml(`
<h2 style="margin:0 0 8px;font-size:20px;">Masters: new matches waiting for approval</h2>
<p style="margin:0;">The monthly search found ${total} new Check-Ins event${total === 1 ? "" : "s"} or group${total === 1 ? "" : "s"} matching your masters. They aren't counted until an admin approves them.</p>
${sections}
${emailButton("Review in Tool Management", link)}
<p style="margin:0;font-size:13px;color:#6b7280;">Tool Management &rsaquo; Database &rsaquo; Masters. Approve or dismiss each one; dismissed ones aren't suggested again.</p>`);
}

async function adminEmails(): Promise<string[]> {
  const rows = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.role, "admin"));
  return [...new Set(rows.map((row) => row.email.trim()).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
}

let searching = false;

export async function runMasterSearch(
  trigger: MasterSearchRun["trigger"],
  userId: string | null,
  now: Date = new Date(),
  listEvents: (token: string) => Promise<CheckInsEvent[]> = listCheckInsEvents,
  listGroupsFn: (token: string) => Promise<GroupInfo[]> = listGroups,
): Promise<MasterSearchRun> {
  const run: MasterSearchRun = { startedAt: now.toISOString(), finishedAt: null, trigger, status: "running", found: [], emailedTo: [] };
  const state = await readMasters();
  if (!state.masters.length) return { ...run, finishedAt: new Date().toISOString(), status: "success", message: "No masters set up yet." };
  const ownerId = userId ?? state.ownerUserId;
  if (!ownerId) return { ...run, finishedAt: new Date().toISOString(), status: "error", message: "Save a master once so the search has a Planning Center connection to use." };
  if (searching) return { ...run, finishedAt: new Date().toISOString(), status: "error", message: "A search is already running." };
  searching = true;
  try {
    const token = await getValidPlanningCenterAccessToken(ownerId);
    const kinds = new Set(state.masters.map((master) => master.kind));
    const events = kinds.has("checkins") ? await listEvents(token) : [];
    const groups = kinds.has("groups") ? await listGroupsFn(token) : [];
    // Re-read so edits made while listing aren't lost.
    const fresh = await readMasters();
    run.found = [...findPending(fresh, events, now, "checkins"), ...findPending(fresh, groups, now, "groups")];
    const total = run.found.reduce((sum, entry) => sum + entry.events.length, 0);
    if (total) {
      const to = await adminEmails();
      if (to.length) {
        const result = await sendEmail({
          to,
          subject: `${total} new master match${total === 1 ? "" : "es"} waiting for approval`,
          html: approvalEmailHtml(run.found, `${siteUrl()}/admin/tools#database`),
        });
        if (result.sent) run.emailedTo = to;
        else run.message = `Email not sent: ${result.error ?? "unknown error"}`;
      } else {
        run.message = "No admin email addresses to notify.";
      }
    }
    run.status = "success";
    run.message = run.message ?? (total ? `${total} new match${total === 1 ? "" : "es"} waiting for approval.` : "No new matches.");
    fresh.lastRun = { ...run, finishedAt: new Date().toISOString() };
    await writeMasters(fresh);
    return fresh.lastRun;
  } catch (error) {
    run.status = "error";
    run.message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, "Check-In master search failed");
    const latest = await readMasters().catch(() => null);
    if (latest) await writeMasters({ ...latest, lastRun: { ...run, finishedAt: new Date().toISOString() } }).catch(() => undefined);
    return { ...run, finishedAt: new Date().toISOString() };
  } finally {
    searching = false;
  }
}

router.post("/search-now", requireAdmin, async (req, res) => {
  try {
    const run = await runMasterSearch("manual", res.locals.dbUser.id);
    if (run.status === "error") {
      res.status(400).json({ error: run.message ?? "Search failed.", run });
      return;
    }
    res.json({ run });
  } catch (error) {
    sendError(req, res, error, "Failed to search for new events");
  }
});

router.post("/run-scheduled", async (req, res) => {
  if (!(await authorizeScheduledCall(req, res, "checkin_masters_search"))) return;
  try {
    await recordScheduledJob("checkin_masters_search", "running");
    const run = await runMasterSearch("scheduled", null);
    const result = run.status === "error" ? "error" : "ok";
    await recordScheduledJob("checkin_masters_search", result, run.message ?? null);
    res.json({ run });
  } catch (error) {
    await recordScheduledJob("checkin_masters_search", "error", error instanceof Error ? error.message : String(error)).catch(() => undefined);
    sendError(req, res, error, "Check-In master search failed");
  }
});

export default router;
