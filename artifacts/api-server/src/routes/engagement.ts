// Engagement dashboard API (2026-10-27, Andrew): a weekly "thermostat" for
// the Check-Ins events, groups and group types picked in Tool Management.
//
//   GET  /api/engagement/dashboard?weeks=8   numbers for the Reporting page
//   GET  /api/engagement/settings            (admin) weights, fields, items...
//   PUT  /api/engagement/settings            (admin) save them
//   GET  /api/engagement/sources             (admin) events / groups / group types to pick from
//   POST /api/engagement/sync-now            (admin) run the weekly sync now
//   POST /api/engagement/send-test-email     (admin) email the summary to yourself
//   POST /api/engagement/run-scheduled       Worker, Mondays 6:00 AM Eastern:
//                                            sync, then email the summary
//
// The math lives in lib/engagementMetrics.ts and lib/engagement.ts; the
// weekly pull in lib/engagementSync.ts.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, engagementAttendanceTable, engagementWeeksTable } from "@workspace/db";
import { gte } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";
import { requireToolAccess } from "../middlewares/requireToolAccess";
import { addDays, weekStartFor } from "../lib/checkinsHistory";
import {
  DASHBOARD_WEEK_OPTIONS,
  ENGAGEMENT_PARTS,
  loadPersonFlags,
  normalizeSettings,
  normalizeTrackedItems,
  normalizeWeights,
  PART_LABELS,
  readEngagementSettings,
  resolveFieldKeys,
  writeEngagementSettings,
  type EngagementSettings,
  type TrackedItem,
} from "../lib/engagement";
import { combinedMetrics, trendSeries, windowMetrics, windowWeeks, type PresenceRow, type WeekRow, type WindowMetrics } from "../lib/engagementMetrics";
import { itemKey, readSyncState, runEngagementSync, type EngagementSyncRun } from "../lib/engagementSync";
import { syncedFields } from "../lib/reportPeople";
import { authorizeScheduledCall, recordScheduledJob } from "../lib/scheduledJobs";
import { sendEmail } from "../lib/email";
import { getValidPlanningCenterAccessToken } from "../lib/planningCenter";
import { logger } from "../lib/logger";
import { fetchCollection, firstValue, parseReportRecipients, text, type JsonApiResource } from "./reports";
import { listCheckInsEvents } from "./attendanceHistory";
import { listGroups } from "./groupHistory";

const router: IRouter = Router();
const GROUPS_BASE = "https://api.planningcenteronline.com/groups/v2";
const TREND_POINTS = 26;

function sendError(req: Request, res: Response, error: unknown, fallback: string) {
  const typed = error as Error & { status?: number };
  req.log.error({ err: error }, fallback);
  res.status(typed.status && typed.status < 600 ? typed.status : 500).json({ error: typed.message || fallback });
}

// ── Dashboard numbers ───────────────────────────────────────────────────────

type ItemDashboard = {
  kind: TrackedItem["kind"];
  id: string;
  name: string;
  current: WindowMetrics;
  previous: WindowMetrics;
  trend: ReturnType<typeof trendSeries>;
  lastWeekWithData: string | null;
};

export type Dashboard = {
  weeks: number;
  window: { from: string; to: string };
  previousWindow: { from: string; to: string };
  items: ItemDashboard[];
  overall: { current: WindowMetrics; previous: WindowMetrics } | null;
  weights: EngagementSettings["weights"];
  servingWindowDays: number;
  fieldsFound: { thrive: boolean; serveClass: boolean; lastServed: boolean };
  lastSync: EngagementSyncRun | null;
  generatedAt: string;
};

export async function buildDashboard(weeks: number, now: Date = new Date()): Promise<Dashboard> {
  const settings = await readEngagementSettings();
  const items = settings.dashboard.items;
  const lastWeek = addDays(weekStartFor(now.toISOString()), -7); // most recent full week
  const window = windowWeeks(lastWeek, weeks);
  const previousWindow = windowWeeks(addDays(lastWeek, -7 * weeks), weeks);
  const earliest = addDays(lastWeek, -7 * (Math.max(TREND_POINTS, 2 * weeks) + weeks));
  const keys = resolveFieldKeys(settings.fields, await syncedFields());
  const state = await readSyncState();

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
  const perItem = items.map((item) => ({
    item,
    weekRows: weekRows.filter((row) => row.itemKind === item.kind && row.itemId === item.id) as WeekRow[],
    presence: presenceRows.filter((row) => row.itemKind === item.kind && row.itemId === item.id) as PresenceRow[],
  }));
  const windowSet = new Set([...window, ...previousWindow]);
  const people = [...new Set(presenceRows.filter((row) => windowSet.has(row.weekStart)).map((row) => row.personId))];
  const flags = await loadPersonFlags(people, keys, addDays(lastWeek, 6), settings.servingWindowDays);

  const itemDashboards: ItemDashboard[] = perItem.map(({ item, weekRows: rows, presence }) => ({
    kind: item.kind,
    id: item.id,
    name: item.name,
    current: windowMetrics(rows, presence, window, flags, settings.weights),
    previous: windowMetrics(rows, presence, previousWindow, flags, settings.weights),
    trend: trendSeries(rows, presence, lastWeek, weeks, TREND_POINTS),
    lastWeekWithData: rows.filter((row) => (row.attendees ?? 0) > 0).map((row) => row.weekStart).sort().pop() ?? null,
  }));
  return {
    weeks,
    window: { from: window[0], to: window[window.length - 1] },
    previousWindow: { from: previousWindow[0], to: previousWindow[previousWindow.length - 1] },
    items: itemDashboards,
    overall: perItem.length > 1
      ? {
        current: combinedMetrics(perItem, window, flags, settings.weights),
        previous: combinedMetrics(perItem, previousWindow, flags, settings.weights),
      }
      : null,
    weights: settings.weights,
    servingWindowDays: settings.servingWindowDays,
    fieldsFound: { thrive: !!keys.thrive, serveClass: !!keys.serveClass, lastServed: !!keys.lastServed },
    lastSync: state.lastRun,
    generatedAt: now.toISOString(),
  };
}

function parseWeeks(raw: unknown, fallback: number): number {
  const value = Number(raw);
  return (DASHBOARD_WEEK_OPTIONS as readonly number[]).includes(value) ? value : fallback;
}

router.get("/dashboard", requireToolAccess("reporting"), async (req, res) => {
  try {
    const settings = await readEngagementSettings();
    res.json(await buildDashboard(parseWeeks(req.query.weeks, settings.dashboard.defaultWeeks)));
  } catch (error) {
    sendError(req, res, error, "Failed to load the engagement dashboard");
  }
});

// ── Weekly email ────────────────────────────────────────────────────────────

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function delta(current: number | null, previous: number | null, format: (value: number) => string): string {
  if (current === null || previous === null) return "";
  const diff = current - previous;
  if (Math.abs(diff) < 1e-9) return ` <span style="color:#6b7280;">(no change)</span>`;
  return ` <span style="color:#6b7280;">(${diff > 0 ? "▲" : "▼"} ${format(Math.abs(diff))})</span>`;
}

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
const num = (value: number | null) => (value === null ? "—" : value >= 10 ? Math.round(value).toLocaleString("en-US") : value.toFixed(1));

export function dashboardEmailHtml(dashboard: Dashboard, siteUrl: string | null): string {
  const cell = "padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;";
  const row = (name: string, current: WindowMetrics, previous: WindowMetrics, bold = false) => `
    <tr style="${bold ? "font-weight:bold;" : ""}">
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escape(name)}</td>
      <td style="${cell}">${current.engagement.score ?? "—"}${delta(current.engagement.score, previous.engagement.score, (value) => `${Math.round(value)}`)}</td>
      <td style="${cell}">${num(current.avgAttendance)}${delta(current.avgAttendance, previous.avgAttendance, (value) => num(value))}</td>
      <td style="${cell}">${pct(current.attendanceRate)}${delta(current.attendanceRate, previous.attendanceRate, (value) => `${Math.round(value * 100)} ${Math.round(value * 100) === 1 ? "pt" : "pts"}`)}</td>
      <td style="${cell}">${num(current.avgNewGuests)}</td>
      <td style="${cell}">${current.uniqueAttendees.toLocaleString("en-US")}</td>
    </tr>`;
  const rows = dashboard.items.map((item) => row(item.name, item.current, item.previous)).join("");
  const overall = dashboard.overall ? row("All tracked", dashboard.overall.current, dashboard.overall.previous, true) : "";
  const head = "padding:6px 8px;border-bottom:2px solid #d1d5db;text-align:right;font-size:12px;color:#4b5563;";
  const range = `${dashboard.window.from} to ${addDays(dashboard.window.to, 6)}`;
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:0 auto;color:#111827;">
      <h2 style="margin:0 0 4px;">Engagement dashboard</h2>
      <p style="margin:0 0 12px;color:#4b5563;">Last ${dashboard.weeks} weeks (${escape(range)}), compared with the ${dashboard.weeks} weeks before.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead><tr>
          <th style="${head}text-align:left;">Group / event</th>
          <th style="${head}">Engagement</th>
          <th style="${head}">Avg. attendance</th>
          <th style="${head}">Attendance rate</th>
          <th style="${head}">New guests / wk</th>
          <th style="${head}">People</th>
        </tr></thead>
        <tbody>${rows}${overall}</tbody>
      </table>
      <p style="font-size:12px;color:#6b7280;margin-top:12px;">
        Engagement (0–100) weighs ${ENGAGEMENT_PARTS.filter((part) => part !== "giving" && dashboard.weights[part] > 0).map((part) => `${PART_LABELS[part]} ×${dashboard.weights[part]}`).join(", ")}.
        People = different people who attended at least once in the window. Weeks nobody attended don't count.
      </p>
      ${siteUrl ? `<p><a href="${escape(siteUrl)}/reporting/engagement">Open the dashboard</a></p>` : ""}
    </div>`;
}

function siteUrl(): string | null {
  const origin = (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",")[0]?.trim();
  return origin && /^https?:\/\//.test(origin) ? origin.replace(/\/$/, "") : null;
}

async function emailDashboard(recipients: string[]): Promise<{ sent: boolean; error?: string }> {
  const settings = await readEngagementSettings();
  const dashboard = await buildDashboard(settings.dashboard.defaultWeeks);
  const result = await sendEmail({
    to: recipients,
    subject: `Engagement dashboard: week of ${dashboard.window.to}`,
    html: dashboardEmailHtml(dashboard, siteUrl()),
  });
  return { sent: result.sent, error: result.error };
}

// ── Settings (admin) ────────────────────────────────────────────────────────

router.get("/settings", requireAdmin, async (req, res) => {
  try {
    const settings = await readEngagementSettings();
    const synced = await syncedFields();
    const state = await readSyncState();
    res.json({
      settings,
      resolvedFields: resolveFieldKeys(settings.fields, synced),
      syncedFields: synced,
      weekOptions: DASHBOARD_WEEK_OPTIONS,
      syncState: Object.fromEntries(settings.dashboard.items.map((item) => [itemKey(item), state.items[itemKey(item)] ?? null])),
      lastSync: state.lastRun,
    });
  } catch (error) {
    sendError(req, res, error, "Failed to load engagement settings");
  }
});

router.put("/settings", requireAdmin, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, any>;
    const current = await readEngagementSettings();
    const dashboardBody = (body.dashboard ?? {}) as Record<string, unknown>;
    let recipients = current.dashboard.recipients;
    if (dashboardBody.recipients !== undefined) {
      const raw = Array.isArray(dashboardBody.recipients) ? dashboardBody.recipients.join(",") : String(dashboardBody.recipients ?? "");
      if (raw.trim()) {
        const parsed = parseReportRecipients(raw);
        if ("error" in parsed) {
          res.status(400).json({ error: parsed.error });
          return;
        }
        recipients = parsed.recipients;
      } else {
        recipients = [];
      }
    }
    const weights = body.weights !== undefined ? normalizeWeights(body.weights) : current.weights;
    if (!ENGAGEMENT_PARTS.some((part) => part !== "giving" && weights[part] > 0)) {
      res.status(400).json({ error: "Give at least one part of the score a weight above 0." });
      return;
    }
    const emailEnabled = dashboardBody.emailEnabled !== undefined ? dashboardBody.emailEnabled === true : current.dashboard.emailEnabled;
    if (emailEnabled && !recipients.length) {
      res.status(400).json({ error: "Add at least one email address for the weekly email, or turn the email off." });
      return;
    }
    const user = res.locals.dbUser;
    const next = normalizeSettings({
      ...current,
      weights,
      fields: body.fields !== undefined ? body.fields : current.fields,
      servingWindowDays: body.servingWindowDays !== undefined ? body.servingWindowDays : current.servingWindowDays,
      dashboard: {
        ...current.dashboard,
        items: dashboardBody.items !== undefined ? normalizeTrackedItems(dashboardBody.items) : current.dashboard.items,
        recipients,
        emailEnabled,
        defaultWeeks: dashboardBody.defaultWeeks !== undefined ? dashboardBody.defaultWeeks : current.dashboard.defaultWeeks,
        ownerUserId: user.id,
        ownerName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "an admin",
      },
    });
    await writeEngagementSettings(next);
    req.log.info({ actorId: user.id, items: next.dashboard.items.length, recipients: next.dashboard.recipients.length }, "Engagement settings saved");
    res.json({ settings: next });
  } catch (error) {
    sendError(req, res, error, "Failed to save engagement settings");
  }
});

// Check-Ins events, groups and group types for the item picker.
router.get("/sources", requireAdmin, async (req, res) => {
  try {
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    const [events, groups, types] = await Promise.all([
      listCheckInsEvents(accessToken).catch(() => []),
      listGroups(accessToken).catch(() => []),
      fetchCollection(`${GROUPS_BASE}/group_types?per_page=100`, accessToken)
        .catch(() => ({ data: [] as JsonApiResource[], included: [] as JsonApiResource[] })),
    ]);
    res.json({
      checkinsEvents: events.filter((event) => !event.archived).map((event) => ({ id: event.id, name: event.name })),
      groups: groups.filter((group) => !group.archived).map((group) => ({ id: group.id, name: group.name })),
      groupTypes: types.data.filter((type) => type.id).map((type) => ({
        id: type.id,
        name: firstValue(type.attributes ?? {}, "name") || `Group type ${type.id}`,
        description: text(type.attributes?.description).slice(0, 120),
      })),
    });
  } catch (error) {
    sendError(req, res, error, "Failed to load Planning Center events and groups");
  }
});

let manualSync: Promise<EngagementSyncRun> | null = null;

// Starts the sync and answers right away (a first backfill can take
// several minutes); the settings card polls GET /settings for lastSync.
router.post("/sync-now", requireAdmin, async (req, res) => {
  if (manualSync) {
    res.status(409).json({ error: "A sync is already running." });
    return;
  }
  manualSync = runEngagementSync("manual").finally(() => { manualSync = null; });
  manualSync.catch((error) => logger.error({ err: error }, "Manual engagement sync failed"));
  res.status(202).json({ started: true });
});

router.post("/send-test-email", requireAdmin, async (req, res) => {
  try {
    const email = text(res.locals.dbUser.email);
    if (!email) {
      res.status(400).json({ error: "Your account has no email address." });
      return;
    }
    const result = await emailDashboard([email]);
    if (!result.sent) {
      res.status(502).json({ error: result.error ?? "The email could not be sent." });
      return;
    }
    res.json({ sent: true, to: email });
  } catch (error) {
    sendError(req, res, error, "Failed to send the test email");
  }
});

// ── Scheduled: Mondays 6:00 AM Eastern (lib/jobSchedule.ts) ─────────────────

router.post("/run-scheduled", async (req, res) => {
  if (!(await authorizeScheduledCall(req, res, "engagement_dashboard"))) return;
  // Held open until done, like the other syncs: an open request keeps the
  // API container awake for the whole run.
  try {
    await recordScheduledJob("engagement_dashboard", "running");
    const settings = await readEngagementSettings();
    if (!settings.dashboard.items.length) {
      await recordScheduledJob("engagement_dashboard", "skipped", "No groups or events are tracked yet.");
      res.json({ skipped: true });
      return;
    }
    const run = await runEngagementSync("scheduled");
    const syncText = run.status === "error"
      ? `Sync failed: ${run.message ?? run.failures[0]?.error ?? "unknown error"}`
      : `${run.itemsChecked} tracked, ${run.weeksSaved} weeks saved${run.failures.length ? `; ${run.failures.length} failed (${run.failures[0].item}: ${run.failures[0].error})` : ""}`;
    let emailText = "email off";
    let emailFailed = false;
    if (settings.dashboard.emailEnabled && settings.dashboard.recipients.length) {
      const email = await emailDashboard(settings.dashboard.recipients);
      emailFailed = !email.sent;
      emailText = email.sent ? `emailed ${settings.dashboard.recipients.length}` : `email failed: ${email.error ?? "unknown error"}`;
    }
    const result = run.status === "error" ? "error" : run.status === "partial" || emailFailed ? "partial" : "ok";
    await recordScheduledJob("engagement_dashboard", result, `${syncText}; ${emailText}.`);
    res.json({ run: { ...run, failures: run.failures.length }, email: emailText });
  } catch (error) {
    logger.error({ err: error }, "Scheduled engagement dashboard run failed");
    await recordScheduledJob("engagement_dashboard", "error", error instanceof Error ? error.message : String(error));
    sendError(req, res, error, "Scheduled engagement dashboard run failed");
  }
});

export default router;
