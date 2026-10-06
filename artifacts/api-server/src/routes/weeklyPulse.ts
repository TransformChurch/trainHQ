// "Weekly Pulse" -- an automated, numbers-only attendance summary email,
// fired every Monday morning by the Worker's Cron Trigger (see
// src/worker.ts's scheduled() handler, which POSTs to /run-scheduled below).
// Pulls a simple attendance count from one or more Check-Ins events and
// Groups, plus a count (and optional single-field breakdown) from any number
// of Planning Center Forms -- all admin-configurable via weeklyPulseConfigTable
// rather than hardcoded, per the "a specific list I'll choose" requirement.
//
// Reuses the proven Check-Ins/PCO-fetch helpers already exported from
// reports.ts rather than re-implementing them a third time. The PCO Groups
// attendance endpoint and the exact FormSubmissionValue answer attribute are
// NOT fully confirmed from Planning Center's public docs (see inline notes
// below) -- both are wrapped defensively so a wrong guess degrades to a
// partial report/zero count instead of crashing the whole run. Run "Send
// test now" from the admin UI against real data once configured to confirm
// both before relying on the Monday automation.
import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import {
  db,
  weeklyPulseConfigTable,
  weeklyPulseRunsTable,
  weeklyPulseMetricsTable,
  type WeeklyPulseConfig,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";
import { getValidPlanningCenterAccessToken } from "../lib/planningCenter";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";
import {
  CHECK_INS_BASE,
  PEOPLE_BASE,
  type JsonApiResource,
  planningCenterRequest,
  fetchCollection,
  relationshipId,
  text,
  firstValue,
  firstReportValue,
  dateOnly,
} from "./reports";

const router: IRouter = Router();

// Planning Center Groups has no prior integration in this codebase. Endpoint
// shapes below follow PCO's general v2 JSON:API conventions but are NOT
// confirmed against Planning Center's public docs the way Check-Ins and
// People/Forms were -- see fetchGroupWeeklyCount().
const GROUPS_BASE = "https://api.planningcenteronline.com/groups/v2";

function sendError(req: Request, res: Response, error: unknown, fallback: string) {
  const typed = error as Error & { status?: number; details?: string };
  req.log.error({ err: error, details: typed.details }, fallback);
  res.status(typed.status ?? 500).json({ error: typed.message || fallback });
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && value.length > 0) : [];
  } catch {
    return [];
  }
}

type WeeklyPulseFormEntry = { formId: string; fieldId: string | null };

// A config can pull from any number of forms (widened 2026-10-02 from a
// single optional form) -- stored the same JSON-text-column way as the other
// variable-length lists on this table.
function parsePcoForms(raw: string | null | undefined): WeeklyPulseFormEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
      .map((value) => ({
        formId: text(value.formId),
        fieldId: text(value.fieldId) || null,
      }))
      .filter((entry) => entry.formId.length > 0);
  } catch {
    return [];
  }
}

function secretsMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Trailing 7-day window ending at midnight UTC of the run day (a Monday, when
// fired by the Cron Trigger -- see worker.ts). Window is UTC-based rather
// than church-local time to keep this simple; revisit if a report lands a
// service on the wrong side of the boundary for Transform Church's time zone.
export function computeWeekRange(reference: Date = new Date()): { start: string; end: string } {
  const end = new Date(reference);
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function fetchCheckInsWeeklyCount(
  eventId: string,
  accessToken: string,
  weekStart: string,
  weekEnd: string,
): Promise<{ count: number; periods: number }> {
  const periodCollection = await fetchCollection(
    `${CHECK_INS_BASE}/events/${encodeURIComponent(eventId)}/event_periods?order=-starts_at&per_page=100`,
    accessToken,
  );
  const periodsInWeek = periodCollection.data.filter((period) => {
    const startsAt = text(period.attributes?.starts_at);
    return startsAt >= weekStart && startsAt < weekEnd;
  });
  if (!periodsInWeek.length) return { count: 0, periods: 0 };
  const periodIds = new Set(periodsInWeek.map((period) => period.id));
  const checkInsCollection = await fetchCollection(
    `${CHECK_INS_BASE}/events/${encodeURIComponent(eventId)}/check_ins?filter=attendee&per_page=100`,
    accessToken,
  );
  const inRange = checkInsCollection.data.filter((checkIn) => periodIds.has(relationshipId(checkIn, "event_period")));
  const uniquePeople = new Set(inRange.map((checkIn) => relationshipId(checkIn, "person")).filter(Boolean));
  return { count: uniquePeople.size || inRange.length, periods: periodsInWeek.length };
}

// Best-effort: Planning Center's Groups API has no prior integration here,
// and the exact resource name for per-event attendance (guessed below as
// GET /events/{id}/attendances) is not confirmed from public docs. Wrapped
// so one wrong guess zeroes out this one group's count with a warning
// instead of failing the whole weekly pulse run.
async function fetchGroupWeeklyCount(
  groupId: string,
  accessToken: string,
  weekStart: string,
  weekEnd: string,
): Promise<{ count: number; eventsFound: number; warning?: string }> {
  try {
    const eventsCollection = await fetchCollection(
      `${GROUPS_BASE}/groups/${encodeURIComponent(groupId)}/events?per_page=100`,
      accessToken,
    );
    const eventsInWeek = eventsCollection.data.filter((event) => {
      const startsAt = text(event.attributes?.starts_at) || dateOnly(event.attributes?.starts_at);
      return startsAt && startsAt >= weekStart && startsAt < weekEnd;
    });
    if (!eventsInWeek.length) return { count: 0, eventsFound: 0 };
    let total = 0;
    let anyAttendanceFetchFailed = false;
    for (const event of eventsInWeek) {
      try {
        const attendanceCollection = await fetchCollection(
          `${GROUPS_BASE}/events/${encodeURIComponent(event.id)}/attendances?per_page=100`,
          accessToken,
        );
        total += attendanceCollection.data.length;
      } catch {
        anyAttendanceFetchFailed = true;
      }
    }
    return {
      count: total,
      eventsFound: eventsInWeek.length,
      warning: anyAttendanceFetchFailed
        ? "Couldn't load attendance for one or more of this group's meetings this week -- the Groups attendance endpoint may need to be verified."
        : undefined,
    };
  } catch (error) {
    return {
      count: 0,
      eventsFound: 0,
      warning: `Couldn't load this group's meetings: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Direct "list fields for a form" endpoint is a best guess at PCO's nested
// resource convention; if it 404s, fall back to the `form_fields` relationship
// included on a recent submission (confirmed to exist from PCO's
// form_submission docs) instead.
async function fetchFormFields(formId: string, accessToken: string): Promise<{ id: string; label: string }[]> {
  try {
    const collection = await fetchCollection(
      `${PEOPLE_BASE}/forms/${encodeURIComponent(formId)}/fields?per_page=100`,
      accessToken,
    );
    if (collection.data.length) {
      return collection.data.map((field) => ({
        id: field.id,
        label: firstValue(field.attributes ?? {}, "label", "name") || `Field ${field.id}`,
      }));
    }
  } catch {
    // fall through to the submission-included fallback below
  }
  try {
    const page = await planningCenterRequest(
      `${PEOPLE_BASE}/forms/${encodeURIComponent(formId)}/form_submissions?include=form_fields&per_page=1`,
      accessToken,
    );
    const included: JsonApiResource[] = Array.isArray(page.included) ? page.included : [];
    return included
      .filter((resource) => resource.type === "FormField")
      .map((field) => ({
        id: field.id,
        label: firstValue(field.attributes ?? {}, "label", "name") || `Field ${field.id}`,
      }));
  } catch {
    return [];
  }
}

type FormWeeklyStats = { totalSubmissions: number; fieldBreakdown: Record<string, number> | null };

// Exact attribute holding a FormSubmissionValue's answer text isn't confirmed
// from public docs -- firstReportValue() tries several plausible names, the
// same tolerance this codebase already uses for other under-documented PCO
// resources (see reports.ts's custom field_data handling).
async function fetchFormWeeklyStats(
  formId: string,
  fieldId: string | null,
  accessToken: string,
  weekStart: string,
  weekEnd: string,
): Promise<FormWeeklyStats> {
  const submissions: JsonApiResource[] = [];
  let url: string | null =
    `${PEOPLE_BASE}/forms/${encodeURIComponent(formId)}/form_submissions?order=-created_at&per_page=100`;
  const visited = new Set<string>();
  while (url && !visited.has(url)) {
    visited.add(url);
    const page = await planningCenterRequest(url, accessToken);
    const rows: JsonApiResource[] = Array.isArray(page.data) ? page.data : [];
    let hitOlder = false;
    for (const row of rows) {
      const createdAt = text(row.attributes?.created_at);
      if (!createdAt) continue;
      if (createdAt < weekStart) { hitOlder = true; continue; }
      if (createdAt < weekEnd) submissions.push(row);
    }
    // Submissions are ordered newest-first, so once we've seen one older than
    // the window there's nothing more to find on later pages.
    if (hitOlder || submissions.length > 5_000) break;
    url = typeof page.links?.next === "string" && page.links.next ? page.links.next : null;
  }

  const result: FormWeeklyStats = { totalSubmissions: submissions.length, fieldBreakdown: null };
  if (fieldId && submissions.length) {
    const breakdown: Record<string, number> = {};
    // Capped so a busy form can't turn one weekly email into hundreds of
    // sequential PCO requests.
    const capped = submissions.slice(0, 200);
    for (const submission of capped) {
      try {
        const valuesCollection = await fetchCollection(
          `${PEOPLE_BASE}/form_submissions/${encodeURIComponent(submission.id)}/form_submission_values?per_page=100`,
          accessToken,
        );
        const match = valuesCollection.data.find((value) => relationshipId(value, "form_field") === fieldId);
        if (match) {
          const answer = firstReportValue(match.attributes ?? {}, "value", "answer", "display_value", "response") || "(blank)";
          breakdown[answer] = (breakdown[answer] ?? 0) + 1;
        }
      } catch {
        // Skip this one submission's breakdown rather than failing the report.
      }
    }
    result.fieldBreakdown = breakdown;
  }
  return result;
}

// sourceId (the Planning Center id) and failed (the whole fetch threw, so
// count is a placeholder 0 for the email, not a real number) exist for the
// tracker -- see weeklyPulseMetricsTable.
type NamedCount = { sourceId: string; name: string; count: number; warning?: string; failed?: boolean };
type FormSummary = {
  sourceId: string;
  failed?: boolean;
  name: string;
  totalSubmissions: number;
  fieldLabel?: string;
  fieldBreakdown?: Record<string, number> | null;
  warning?: string;
};

function buildEmailHtml(
  config: WeeklyPulseConfig,
  weekRange: { start: string; end: string },
  checkins: NamedCount[],
  groups: NamedCount[],
  forms: FormSummary[],
): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const row = (label: string, count: number | string, warning?: string) => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e5e5;color:#1a1a1a;">${escapeHtml(label)}${
        warning ? `<br><span style="font-size:11px;color:#b45309;">${escapeHtml(warning)}</span>` : ""
      }</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e5e5;text-align:right;font-weight:600;color:#1a1a1a;">${count}</td>
    </tr>`;

  const sections: string[] = [];
  if (checkins.length) {
    sections.push(`
      <h3 style="margin:20px 0 4px;font-size:14px;color:#374151;">Check-Ins</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${checkins
        .map((item) => row(item.name, item.count, item.warning))
        .join("")}</table>`);
  }
  if (groups.length) {
    sections.push(`
      <h3 style="margin:20px 0 4px;font-size:14px;color:#374151;">Groups</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${groups
        .map((item) => row(item.name, item.count, item.warning))
        .join("")}</table>`);
  }
  for (const form of forms) {
    const breakdownRows = form.fieldBreakdown
      ? Object.entries(form.fieldBreakdown)
          .sort((a, b) => b[1] - a[1])
          .map(([label, count]) => row(label, count))
          .join("")
      : "";
    sections.push(`
      <h3 style="margin:20px 0 4px;font-size:14px;color:#374151;">${escapeHtml(form.name)}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${row("Total submissions this week", form.totalSubmissions, form.warning)}
        ${form.fieldLabel ? row(`Breakdown by "${form.fieldLabel}"`, "") : ""}
        ${breakdownRows}
      </table>`);
  }

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;">
      <h2 style="margin:0 0 4px;font-size:18px;color:#111827;">${escapeHtml(config.name)}</h2>
      <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Week of ${fmt(weekRange.start)} – ${fmt(weekRange.end)}</p>
      ${sections.join("") || '<p style="font-size:14px;color:#6b7280;">No sources are configured for this report yet.</p>'}
    </div>`;
}

type PulseResults = {
  checkins: NamedCount[];
  groups: NamedCount[];
  forms: FormSummary[];
};

async function collectWeeklyPulse(
  config: WeeklyPulseConfig,
  accessToken: string,
  weekRange: { start: string; end: string },
): Promise<PulseResults> {
  const eventIds = parseJsonArray(config.checkinsEventIds);
  const groupIds = parseJsonArray(config.groupIds);

  const checkinsResults: NamedCount[] = [];
  for (const eventId of eventIds) {
    try {
      const eventPage = await planningCenterRequest(`${CHECK_INS_BASE}/events/${encodeURIComponent(eventId)}`, accessToken);
      const name = firstValue(eventPage.data?.attributes ?? {}, "name") || `Event ${eventId}`;
      const { count } = await fetchCheckInsWeeklyCount(eventId, accessToken, weekRange.start, weekRange.end);
      checkinsResults.push({ sourceId: eventId, name, count });
    } catch (error) {
      checkinsResults.push({
        sourceId: eventId,
        failed: true,
        name: `Event ${eventId}`,
        count: 0,
        warning: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const groupsResults: NamedCount[] = [];
  for (const groupId of groupIds) {
    try {
      const groupPage = await planningCenterRequest(`${GROUPS_BASE}/groups/${encodeURIComponent(groupId)}`, accessToken);
      const name = firstValue(groupPage.data?.attributes ?? {}, "name") || `Group ${groupId}`;
      const { count, warning } = await fetchGroupWeeklyCount(groupId, accessToken, weekRange.start, weekRange.end);
      groupsResults.push({ sourceId: groupId, name, count, warning });
    } catch (error) {
      groupsResults.push({
        sourceId: groupId,
        failed: true,
        name: `Group ${groupId}`,
        count: 0,
        warning: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const formResults: FormSummary[] = [];
  for (const { formId, fieldId } of parsePcoForms(config.pcoForms)) {
    try {
      const formPage = await planningCenterRequest(`${PEOPLE_BASE}/forms/${encodeURIComponent(formId)}`, accessToken);
      const name = firstValue(formPage.data?.attributes ?? {}, "name", "title") || `Form ${formId}`;
      const stats = await fetchFormWeeklyStats(formId, fieldId, accessToken, weekRange.start, weekRange.end);
      let fieldLabel: string | undefined;
      if (fieldId) {
        const fields = await fetchFormFields(formId, accessToken);
        fieldLabel = fields.find((field) => field.id === fieldId)?.label;
      }
      formResults.push({
        sourceId: formId,
        name,
        totalSubmissions: stats.totalSubmissions,
        fieldLabel: fieldLabel ?? (fieldId ? `Field ${fieldId}` : undefined),
        fieldBreakdown: stats.fieldBreakdown,
      });
    } catch (error) {
      formResults.push({
        sourceId: formId,
        failed: true,
        name: `Form ${formId}`,
        totalSubmissions: 0,
        fieldBreakdown: null,
        warning: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { checkins: checkinsResults, groups: groupsResults, forms: formResults };
}

export type PulseMetricRow = {
  sourceType: "checkins" | "group" | "form" | "form_field";
  sourceId: string;
  sourceName: string;
  fieldLabel: string | null;
  detail: string | null;
  value: number | null;
  warning: string | null;
};

// Flattens one run's results into tracker rows. A source whose fetch threw
// entirely is stored as value NULL (with the reason in warning) rather than
// the 0 the email shows, so a Planning Center hiccup never reads as "nobody
// came" in a year-over-year comparison.
export function metricsFromResults(results: PulseResults): PulseMetricRow[] {
  const rows: PulseMetricRow[] = [];
  for (const item of results.checkins) {
    rows.push({
      sourceType: "checkins", sourceId: item.sourceId, sourceName: item.name, fieldLabel: null, detail: null,
      value: item.failed ? null : item.count, warning: item.warning ?? null,
    });
  }
  for (const item of results.groups) {
    rows.push({
      sourceType: "group", sourceId: item.sourceId, sourceName: item.name, fieldLabel: null, detail: null,
      value: item.failed ? null : item.count, warning: item.warning ?? null,
    });
  }
  for (const form of results.forms) {
    rows.push({
      sourceType: "form", sourceId: form.sourceId, sourceName: form.name, fieldLabel: null, detail: null,
      value: form.failed ? null : form.totalSubmissions, warning: form.warning ?? null,
    });
    for (const [answer, count] of Object.entries(form.fieldBreakdown ?? {}).sort((a, b) => b[1] - a[1])) {
      rows.push({
        sourceType: "form_field", sourceId: form.sourceId, sourceName: form.name, fieldLabel: form.fieldLabel ?? null,
        detail: answer, value: count, warning: null,
      });
    }
  }
  return rows;
}

// True when the window is the standard Monday-to-Monday week the Cron
// Trigger produces (ends Monday 00:00 UTC, 7 days long). Only these runs
// feed the tracker -- see weeklyPulseRunsTable.countsTowardTracker.
export function isStandardWeek(weekRange: { start: string; end: string }): boolean {
  const end = new Date(weekRange.end);
  const start = new Date(weekRange.start);
  return (
    end.getUTCDay() === 1 &&
    end.getUTCHours() === 0 && end.getUTCMinutes() === 0 && end.getUTCSeconds() === 0 &&
    end.getTime() - start.getTime() === 7 * 24 * 60 * 60 * 1000
  );
}

export async function recordRun(
  config: WeeklyPulseConfig,
  trigger: "scheduled" | "manual",
  weekRange: { start: string; end: string },
  results: PulseResults,
): Promise<number> {
  const weekStart = weekRange.start.slice(0, 10);
  const weekEnd = weekRange.end.slice(0, 10);
  const countsTowardTracker = isStandardWeek(weekRange);
  const metrics = metricsFromResults(results);
  return db.transaction(async (tx) => {
    if (countsTowardTracker) {
      // A newer run for the same config + week (a retry or a Monday re-send)
      // replaces the earlier one in the tracker; the old run stays as history.
      await tx.update(weeklyPulseRunsTable)
        .set({ countsTowardTracker: false })
        .where(and(
          eq(weeklyPulseRunsTable.configId, config.id),
          eq(weeklyPulseRunsTable.weekStart, weekStart),
          eq(weeklyPulseRunsTable.countsTowardTracker, true),
        ));
    }
    const [run] = await tx.insert(weeklyPulseRunsTable).values({
      configId: config.id,
      configName: config.name,
      trigger,
      weekStart,
      weekEnd,
      countsTowardTracker,
    }).returning({ id: weeklyPulseRunsTable.id });
    if (metrics.length) {
      await tx.insert(weeklyPulseMetricsTable).values(metrics.map((row) => ({ ...row, runId: run.id })));
    }
    return run.id;
  });
}

async function runWeeklyPulse(
  config: WeeklyPulseConfig,
  trigger: "scheduled" | "manual",
): Promise<{ sent: boolean; error?: string }> {
  const accessToken = await getValidPlanningCenterAccessToken(config.createdByUserId);
  const weekRange = computeWeekRange();
  const recipientEmails = parseJsonArray(config.recipientEmails);
  if (!recipientEmails.length) return { sent: false, error: "No recipient emails configured." };

  const results = await collectWeeklyPulse(config, accessToken, weekRange);

  // Numbers are saved before the email goes out, so a mail failure (like the
  // Resend "from" error) never loses a week. A failure to save is logged but
  // doesn't block the email -- the email is the existing behavior.
  let runId: number | null = null;
  try {
    runId = await recordRun(config, trigger, weekRange, results);
  } catch (error) {
    logger.error({ err: error, configId: config.id }, "Failed to record weekly pulse run to the tracker");
  }

  const html = buildEmailHtml(config, weekRange, results.checkins, results.groups, results.forms);
  const subjectDate = new Date(weekRange.end).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  // Same numbers as the email body, as a spreadsheet-ready attachment -- the
  // identical format to the "Latest report" download.
  const weekStart = weekRange.start.slice(0, 10);
  const csv = buildLatestReportCsv(
    { configName: config.name, weekStart, weekEnd: weekRange.end.slice(0, 10), ranAt: new Date(), trigger },
    metricsFromResults(results),
  );
  const safeName = config.name.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "weekly-pulse";
  const result = await sendEmail({
    to: recipientEmails,
    subject: `${config.name} — week ending ${subjectDate}`,
    html,
    attachments: [{ filename: `${safeName}-${weekStart}.csv`, content: "\uFEFF" + csv }],
  });

  if (runId !== null) {
    await db.update(weeklyPulseRunsTable)
      .set({ emailStatus: result.sent ? "sent" : "error", emailError: result.sent ? null : (result.error ?? "Unknown error") })
      .where(eq(weeklyPulseRunsTable.id, runId))
      .catch((error) => logger.error({ err: error, runId }, "Failed to record weekly pulse email status"));
  }
  return result;
}

async function recordRunResult(id: number, result: { sent: boolean; error?: string }) {
  await db.update(weeklyPulseConfigTable).set({
    lastRunAt: new Date(),
    lastRunStatus: result.sent ? "success" : "error",
    lastRunError: result.sent ? null : (result.error ?? "Unknown error"),
  }).where(eq(weeklyPulseConfigTable.id, id));
}

// Audit finding 5.1 (High): neither the manual "run now" endpoint nor the
// Cron-triggered run-scheduled endpoint had any overlap/idempotency guard --
// if the Worker's Cron Trigger retried, or an admin's manual test happened
// to overlap with a scheduled run, every enabled config's full attendance
// email would be sent twice to its recipient list with nothing detecting or
// preventing it (contrast with wikiDriveSync.ts's lease-based lock for the
// same kind of risk). This does a fresh, single-row re-check of a config's
// own lastRunAt immediately before running it -- not the possibly-stale
// value from an earlier bulk select -- and treats anything that ran within
// the last 10 minutes as still in flight. 10 minutes is long enough to
// absorb a near-simultaneous double fire but far shorter than the normal
// weekly cadence, so it never interferes with a legitimate run, including a
// deliberate "run now" test more than 10 minutes after the last one.
const RUN_OVERLAP_GUARD_MS = 10 * 60 * 1000;

async function ranWithinOverlapWindow(id: number): Promise<boolean> {
  const rows = await db.select({ lastRunAt: weeklyPulseConfigTable.lastRunAt })
    .from(weeklyPulseConfigTable)
    .where(eq(weeklyPulseConfigTable.id, id))
    .limit(1);
  const lastRunAt = rows[0]?.lastRunAt;
  return !!lastRunAt && Date.now() - lastRunAt.getTime() < RUN_OVERLAP_GUARD_MS;
}

// ── GET /api/weekly-pulse/sources ───────────────────────────────────────────
// Lists Check-Ins events, Groups, and Forms for the admin's picker UI.
router.get("/sources", requireAdmin, async (req, res) => {
  try {
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    let groupsError: string | undefined;
    let formsError: string | undefined;
    const [eventsCollection, groupsCollection, formsCollection] = await Promise.all([
      fetchCollection(`${CHECK_INS_BASE}/events?filter=not_archived&order=name&per_page=100`, accessToken),
      fetchCollection(`${GROUPS_BASE}/groups?per_page=100`, accessToken).catch((error) => {
        req.log.warn({ err: error }, "Failed to load Planning Center groups for weekly pulse picker");
        // Surfaced to the admin UI below -- this used to be swallowed
        // entirely (just an empty list with no visible reason), which made
        // the 2026-10-02 missing-OAuth-scope bug look like groups simply
        // "didn't populate" with nothing to go on.
        groupsError = (error as Error & { status?: number }).status === 403
          ? "Reconnect Church Center to grant Groups access (the current connection predates it)."
          : error instanceof Error ? error.message : String(error);
        return { data: [] as JsonApiResource[], included: [] as JsonApiResource[] };
      }),
      fetchCollection(`${PEOPLE_BASE}/forms?per_page=100`, accessToken).catch((error) => {
        req.log.warn({ err: error }, "Failed to load Planning Center forms for weekly pulse picker");
        formsError = error instanceof Error ? error.message : String(error);
        return { data: [] as JsonApiResource[], included: [] as JsonApiResource[] };
      }),
    ]);
    res.json({
      checkinsEvents: eventsCollection.data.map((event) => ({
        id: event.id,
        name: firstValue(event.attributes ?? {}, "name") || `Event ${event.id}`,
      })),
      groups: groupsCollection.data.map((group) => ({
        id: group.id,
        name: firstValue(group.attributes ?? {}, "name") || `Group ${group.id}`,
      })),
      forms: formsCollection.data.map((form) => ({
        id: form.id,
        name: firstValue(form.attributes ?? {}, "name", "title") || `Form ${form.id}`,
      })),
      groupsError,
      formsError,
    });
  } catch (error) {
    sendError(req, res, error, "Failed to load Planning Center sources");
  }
});

// ── GET /api/weekly-pulse/forms/:formId/fields ──────────────────────────────
router.get("/forms/:formId/fields", requireAdmin, async (req, res) => {
  try {
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    const fields = await fetchFormFields(text(req.params.formId), accessToken);
    res.json(fields);
  } catch (error) {
    sendError(req, res, error, "Failed to load Planning Center form fields");
  }
});

// ── GET /api/weekly-pulse/config ────────────────────────────────────────────
router.get("/config", requireAdmin, async (_req, res) => {
  const rows = await db.select().from(weeklyPulseConfigTable).orderBy(weeklyPulseConfigTable.name);
  res.json(rows.map((row) => ({
    ...row,
    recipientEmails: parseJsonArray(row.recipientEmails),
    checkinsEventIds: parseJsonArray(row.checkinsEventIds),
    groupIds: parseJsonArray(row.groupIds),
    pcoForms: parsePcoForms(row.pcoForms),
  })));
});

// ── POST /api/weekly-pulse/config ───────────────────────────────────────────
// Upsert: pass `id` in the body to update an existing config, omit it to
// create a new one.
router.post("/config", requireAdmin, async (req, res) => {
  try {
    const id = Number.isInteger(req.body?.id) ? (req.body.id as number) : null;
    const name = text(req.body?.name) || "Weekly Attendance Pulse";
    const enabled = req.body?.enabled !== false;
    const recipientEmails = Array.isArray(req.body?.recipientEmails)
      ? req.body.recipientEmails.filter((value: unknown): value is string => typeof value === "string" && /\S+@\S+\.\S+/.test(value))
      : [];
    const checkinsEventIds = Array.isArray(req.body?.checkinsEventIds)
      ? req.body.checkinsEventIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
      : [];
    const groupIds = Array.isArray(req.body?.groupIds)
      ? req.body.groupIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
      : [];
    const pcoForms: WeeklyPulseFormEntry[] = Array.isArray(req.body?.pcoForms)
      ? req.body.pcoForms
          .filter((value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null)
          .map((value: Record<string, unknown>) => ({ formId: text(value.formId), fieldId: text(value.fieldId) || null }))
          .filter((entry: WeeklyPulseFormEntry) => entry.formId.length > 0)
      : [];

    if (!recipientEmails.length) {
      res.status(400).json({ error: "Add at least one valid recipient email." });
      return;
    }
    if (!checkinsEventIds.length && !groupIds.length && !pcoForms.length) {
      res.status(400).json({ error: "Select at least one Check-Ins event, group, or form." });
      return;
    }

    const values = {
      name,
      enabled,
      recipientEmails: JSON.stringify(recipientEmails),
      checkinsEventIds: JSON.stringify(checkinsEventIds),
      groupIds: JSON.stringify(groupIds),
      pcoForms: JSON.stringify(pcoForms),
      updatedAt: new Date(),
    };

    const rows = id
      ? await db.update(weeklyPulseConfigTable).set(values).where(eq(weeklyPulseConfigTable.id, id)).returning()
      : await db.insert(weeklyPulseConfigTable).values({ ...values, createdByUserId: res.locals.dbUser.id }).returning();

    if (!rows[0]) {
      res.status(404).json({ error: "Weekly pulse config not found." });
      return;
    }
    res.json({ ...rows[0], recipientEmails, checkinsEventIds, groupIds, pcoForms });
  } catch (error) {
    sendError(req, res, error, "Failed to save weekly pulse config");
  }
});

// ── DELETE /api/weekly-pulse/config/:id ─────────────────────────────────────
router.delete("/config/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid config id." });
    return;
  }
  await db.delete(weeklyPulseConfigTable).where(eq(weeklyPulseConfigTable.id, id));
  res.status(204).end();
});

// ── POST /api/weekly-pulse/config/:id/run-now ───────────────────────────────
// Manual "send test now" button in the admin UI -- uses the clicking admin's
// own stored Planning Center connection.
router.post("/config/:id/run-now", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid config id." });
      return;
    }
    const rows = await db.select().from(weeklyPulseConfigTable).where(eq(weeklyPulseConfigTable.id, id)).limit(1);
    const config = rows[0];
    if (!config) {
      res.status(404).json({ error: "Weekly pulse config not found." });
      return;
    }
    if (await ranWithinOverlapWindow(id)) {
      res.status(409).json({ error: "This weekly pulse already ran in the last few minutes. Wait a moment before running it again." });
      return;
    }
    const result = await runWeeklyPulse({ ...config, createdByUserId: res.locals.dbUser.id }, "manual");
    await recordRunResult(id, result);
    if (!result.sent) {
      res.status(502).json({ error: result.error ?? "Failed to send the weekly pulse email." });
      return;
    }
    res.json({ sent: true });
  } catch (error) {
    sendError(req, res, error, "Failed to run weekly pulse");
  }
});

// Excel/Sheets treat a cell starting with = + - @ (or tab/CR) as a formula.
// Names and form answers come from Planning Center and anyone filling out a
// public form, so neutralise those before they reach a spreadsheet.
function csvCell(value: unknown): string {
  let raw = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(raw)) raw = `'${raw}`;
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

const SECTION_LABELS: Record<string, string> = {
  checkins: "Check-Ins",
  group: "Groups",
  form: "Forms",
  form_field: "Forms",
};

export function buildLatestReportCsv(
  run: { configName: string; weekStart: string; weekEnd: string; ranAt: Date; trigger: string },
  metrics: PulseMetricRow[],
): string {
  const header = ["Report", "Week start", "Week end", "Ran at (UTC)", "Run type", "Section", "Source", "Question", "Answer", "Count", "Note"];
  const ranAt = run.ranAt.toISOString().replace("T", " ").slice(0, 16);
  const runType = run.trigger === "scheduled" ? "Scheduled" : "Manual";
  const lines = metrics.map((row) => [
    run.configName,
    run.weekStart,
    run.weekEnd,
    ranAt,
    runType,
    SECTION_LABELS[row.sourceType] ?? row.sourceType,
    row.sourceName,
    row.sourceType === "form_field" ? (row.fieldLabel ?? "") : row.sourceType === "form" ? "Total submissions" : "",
    row.detail ?? "",
    row.value,
    row.value === null ? `Not available: ${row.warning ?? "fetch failed"}` : (row.warning ?? ""),
  ]);
  return [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ── GET /api/weekly-pulse/config/:id/latest-report.csv ──────────────────────
// The numbers from this config's most recent run (scheduled or test), as a
// CSV for Excel/Sheets.
router.get("/config/:id/latest-report.csv", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid config id." });
      return;
    }
    const runs = await db.select().from(weeklyPulseRunsTable)
      .where(eq(weeklyPulseRunsTable.configId, id))
      .orderBy(desc(weeklyPulseRunsTable.ranAt), desc(weeklyPulseRunsTable.id))
      .limit(1);
    const run = runs[0];
    if (!run) {
      res.status(404).json({ error: "No saved report yet. Reports are saved starting with the next run." });
      return;
    }
    const metrics = await db.select().from(weeklyPulseMetricsTable)
      .where(eq(weeklyPulseMetricsTable.runId, run.id))
      .orderBy(weeklyPulseMetricsTable.id);
    const body = buildLatestReportCsv(run, metrics.map((row) => ({
      sourceType: row.sourceType as PulseMetricRow["sourceType"],
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      fieldLabel: row.fieldLabel,
      detail: row.detail,
      value: row.value,
      warning: row.warning,
    })));
    const safeName = run.configName.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "weekly-pulse";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-${run.weekStart}.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.send("\uFEFF" + body);
  } catch (error) {
    sendError(req, res, error, "Failed to download the latest weekly pulse report");
  }
});

// ── POST /api/weekly-pulse/run-scheduled ────────────────────────────────────
// Internal endpoint called by the Worker's scheduled() Cron Trigger handler
// (see src/worker.ts), not reachable by normal users -- this Container has no
// ingress of its own, so every request (public or Cron-triggered) passes
// through the same Worker fetch()/scheduled() path. The shared secret below
// is what distinguishes a legitimate scheduled call from an arbitrary public
// request to this same route; it must be set as WEEKLY_PULSE_RUN_SECRET in
// both the container's env and the Worker's envVars passed to it.
router.post("/run-scheduled", async (req, res) => {
  const expectedSecret = process.env.WEEKLY_PULSE_RUN_SECRET;
  const providedSecret = req.header("x-internal-secret") ?? "";
  if (!expectedSecret || !providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const configs = await db.select().from(weeklyPulseConfigTable).where(eq(weeklyPulseConfigTable.enabled, true));
  const results: { id: number; sent: boolean; error?: string }[] = [];
  for (const config of configs) {
    try {
      if (await ranWithinOverlapWindow(config.id)) {
        results.push({ id: config.id, sent: false, error: "Skipped: this config already ran within the overlap guard window." });
        continue;
      }
      const result = await runWeeklyPulse(config, "scheduled");
      await recordRunResult(config.id, result);
      results.push({ id: config.id, sent: result.sent, error: result.error });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordRunResult(config.id, { sent: false, error: message });
      results.push({ id: config.id, sent: false, error: message });
    }
  }
  req.log.info({ ranConfigs: results.length, results }, "Weekly pulse scheduled run complete");
  res.json({ ranConfigs: results.length, results });
});

export default router;
