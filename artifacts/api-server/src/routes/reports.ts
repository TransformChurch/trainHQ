import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import {
  db,
  reportRunsTable,
  reportScriptsTable,
  reportTemplatesTable,
} from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";
import { requireToolAccess } from "../middlewares/requireToolAccess";
import { lookupReportPeople, stripContactAttributes } from "../lib/reportPeople";
import { getValidPlanningCenterAccessToken } from "../lib/planningCenter";
import { ObjectStorageService } from "../lib/objectStorage";
import { sendEmail } from "../lib/email";
import {
  addDays,
  buildWeeklyHistory,
  genderByPersonFromIncluded,
  loadTrendRowsForEvents,
  readWeekOverrides,
  saveHistoryRows,
  weekStartFor,
} from "../lib/checkinsHistory";
import {
  applyWeekCopy,
  mergeEventData,
  periodsInWeek,
  pickSessions,
  pickHeldSessions,
  reportFirstTimers,
  type EventData,
} from "../lib/reportEvents";

const router: IRouter = Router();
const storage = new ObjectStorageService();
// Exported so routes/weeklyPulse.ts can reuse the same base URLs rather than
// re-declaring them.
export const CHECK_INS_BASE = "https://api.planningcenteronline.com/check-ins/v2";
export const PEOPLE_BASE = "https://api.planningcenteronline.com/people/v2";
const REPORT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SESSION_COUNT = 5;
const MAX_SESSION_COUNT = 52;
type CleanupMode = "month_quarter" | "all_dates";
// Cleanup scripts only -- the third "template" slot (xlsx-template-filling
// via LibreOffice) was removed along with the legacy upload-your-own-xlsx
// reporting path. See REPORT_ENGINES: every template is now one of the 4
// built-in pure-Python engines.
type ScriptSlot = CleanupMode;
// The built-in, pure-Python (no Excel/LibreOffice) report renderers.
// A template row with one of these set skips the generic
// upload-your-own-xlsx-workbook pipeline entirely -- see REPORT_ENGINES.
type ReportEngine = "youth_quarterly" | "youth_monthly" | "kids_rutherford" | "kids_lyndhurst" | "kids_rutherford_quarterly" | "kids_lyndhurst_quarterly";
type PreparationProgress = {
  stage: "loading" | "profiles" | "complete" | "failed";
  completedBatches: number;
  totalBatches: number;
  message: string;
  expiresAt: number;
};

const PEOPLE_BATCH_SIZE = 15;
const PEOPLE_BATCH_DELAY_MS = 2_000;
const PROGRESS_TTL_MS = 10 * 60 * 1000;
const MAX_SCRIPT_BYTES = 500_000;
const SCRIPT_SLOTS: Array<{ slot: ScriptSlot; label: string }> = [
  { slot: "month_quarter", label: "Monthly/Quarterly cleanup" },
  { slot: "all_dates", label: "All Dates cleanup" },
];
const preparationProgress = new Map<string, PreparationProgress>();

function progressKey(userId: string, progressId: string): string {
  return `${userId}:${progressId}`;
}

function setPreparationProgress(userId: string, progressId: string, progress: Omit<PreparationProgress, "expiresAt">) {
  preparationProgress.set(progressKey(userId, progressId), {
    ...progress,
    expiresAt: Date.now() + PROGRESS_TTL_MS,
  });
}

function cleanPreparationProgress() {
  const now = Date.now();
  for (const [key, progress] of preparationProgress) {
    if (progress.expiresAt <= now) preparationProgress.delete(key);
  }
}

// Belt-and-suspenders against a double-submitted /prepare request (e.g. a
// fast double-click/double-tap firing two click events before the frontend's
// own `disabled={preparing}` re-render lands, or a flaky network causing a
// client-side retry while the first request is still in flight): a second
// concurrent run is never just wasted work, it's actively harmful. Both runs
// share this one container instance's single CPU, so instead of one script
// run finishing comfortably inside its budget, two compete for the same
// cycles and can each end up slower than the timeout they were each given
// individually -- turning "redundant" into "both fail." Tracked per-user
// (not globally) so one admin's long-running pull never blocks another's.
const activePrepareRuns = new Set<string>();
const PREPARE_IN_PROGRESS_MESSAGE =
  "A report is already being prepared for your account -- wait for it to finish (or fail) before starting another.";
const REPORT_FIELDS = [
  { key: "planning_center_id", label: "Planning Center ID" },
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "birthdate", label: "Birthdate" },
  { key: "email", label: "Email" },
  { key: "phone_home", label: "Phone Number (home)" },
  { key: "phone_mobile", label: "Phone Number (mobile)" },
  { key: "primary_contact_name", label: "Primary Contact Name" },
  { key: "primary_contact_email", label: "Primary Contact Email" },
  { key: "gender", label: "Gender" },
  { key: "grade", label: "Grade" },
  { key: "first_timers", label: "First Timers" },
  { key: "completed_thrive", label: "Completed Thrive" },
  { key: "baptized", label: "Baptized?" },
  { key: "last_served", label: "Last served" },
] as const;
const DEFAULT_PULL_FIELDS = REPORT_FIELDS.map((field) => field.key);
type StandardFieldKey = typeof REPORT_FIELDS[number]["key"];
type ReportFieldKey = StandardFieldKey | `custom:${string}`;
type ReportFieldDefinition = { key: ReportFieldKey; label: string };

// Exported so routes/weeklyPulse.ts (and anything else talking to a PCO
// JSON:API endpoint) can reuse this instead of redeclaring an equivalent
// shape.
export type JsonApiResource = {
  id: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string; type?: string } | null }>;
};

// Exported for reuse by routes/weeklyPulse.ts.
export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function csv(value: unknown): string {
  const raw = String(value ?? "");
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

// Exported for reuse by routes/weeklyPulse.ts.
export function dateOnly(value: unknown): string {
  const raw = text(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "report";
}

function normalizePullFields(raw: unknown): ReportFieldKey[] {
  let values: unknown = raw;
  if (typeof raw === "string") {
    try { values = JSON.parse(raw); } catch { values = []; }
  }
  const valid = new Set<string>(REPORT_FIELDS.map((field) => field.key));
  const selected = Array.isArray(values)
    ? values.filter((value): value is ReportFieldKey =>
      typeof value === "string" && (valid.has(value) || /^custom:[A-Za-z0-9_-]+$/.test(value)),
    )
    : [];
  return ["planning_center_id", ...selected.filter((field) => field !== "planning_center_id")];
}

function normalizeSessionCount(raw: unknown): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= MAX_SESSION_COUNT
    ? value
    : DEFAULT_SESSION_COUNT;
}

function normalizeCleanupMode(raw: unknown): CleanupMode {
  return raw === "all_dates" ? "all_dates" : "month_quarter";
}

function isCustomFieldKey(key: ReportFieldKey): key is `custom:${string}` {
  return key.startsWith("custom:");
}

function fieldLabel(key: ReportFieldKey, customLabels = new Map<string, string>()): string {
  if (isCustomFieldKey(key)) return customLabels.get(key) || `Planning Center field ${key.slice("custom:".length)}`;
  return REPORT_FIELDS.find((field) => field.key === key)!.label;
}

async function fetchReportFieldDefinitions(accessToken: string): Promise<ReportFieldDefinition[]> {
  const collection = await fetchCollection(`${PEOPLE_BASE}/field_definitions?per_page=100`, accessToken);
  return collection.data
    .filter((field) => !field.attributes?.deleted_at)
    .map((field) => ({
      key: `custom:${field.id}` as ReportFieldKey,
      label: firstValue(field.attributes ?? {}, "name", "label") || `Planning Center field ${field.id}`,
    }));
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(value); value = ""; }
    else if (character === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += character;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((candidate) => candidate.some((cell) => cell.length > 0));
}

function selectCleanedColumns(cleaned: string, selectedFields: ReportFieldKey[], customLabels: Map<string, string>): string {
  const rows = parseCsv(cleaned);
  if (!rows.length) throw new Error("The cleanup script returned no rows.");
  const inputHeaders = rows[0];
  const selectedHeaders = selectedFields.map((field) => fieldLabel(field, customLabels));
  const indexes = selectedHeaders.map((header) => inputHeaders.indexOf(header));
  const weekIndexes = inputHeaders
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => /^\d{4}-\d{2}-\d{2}$/.test(header));
  const attendanceIndex = inputHeaders.indexOf("Attendance Rate");
  const outputHeaders = [...selectedHeaders, ...weekIndexes.map(({ header }) => header), "Attendance Rate"];
  const outputRows = rows.slice(1).map((row) => [
    ...indexes.map((index) => index >= 0 ? row[index] ?? "" : ""),
    ...weekIndexes.map(({ index }) => row[index] ?? ""),
    attendanceIndex >= 0 ? row[attendanceIndex] ?? "" : "",
  ]);
  return [outputHeaders, ...outputRows].map((row) => row.map(csv).join(",")).join("\n");
}

// Exported so routes/weeklyPulse.ts reuses this instead of a third copy of
// the same retry/backoff-on-429 logic (see the 2026-10-01 comment on
// PEOPLE_BATCH_SIZE/PEOPLE_BATCH_DELAY_MS above for the rate-limit numbers
// this is paced against).
export async function planningCenterRequest(url: string, accessToken: string): Promise<any> {
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": "Transform Church Reporting",
      },
    });
    if (response.ok) return response.json();

    const body = await response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < maxAttempts - 1) {
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : Math.min(1_000 * 2 ** attempt, 15_000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    const permission = response.status === 401 || response.status === 403;
    const error = new Error(
      permission
        ? "Planning Center Check-Ins access is missing. Reconnect Church Center and approve Check-Ins access."
        : response.status === 429
          ? "Planning Center is temporarily limiting report requests. Please try preparing the report again shortly."
          : `Planning Center request failed (${response.status}).`,
    ) as Error & { status?: number; details?: string };
    error.status = permission ? 403 : response.status === 429 ? 503 : 502;
    error.details = body.slice(0, 1000);
    throw error;
  }
  throw new Error("Planning Center request retry limit was reached.");
}

// Exported for the same reason as planningCenterRequest() above.
export async function fetchCollection(
  initialUrl: string,
  accessToken: string,
): Promise<{ data: JsonApiResource[]; included: JsonApiResource[] }> {
  const data: JsonApiResource[] = [];
  const included: JsonApiResource[] = [];
  const visited = new Set<string>();
  let next: string | null = initialUrl;
  while (next && !visited.has(next)) {
    visited.add(next);
    const page = await planningCenterRequest(next, accessToken);
    data.push(...(Array.isArray(page.data) ? page.data : []));
    included.push(...(Array.isArray(page.included) ? page.included : []));
    next = typeof page.links?.next === "string" && page.links.next ? page.links.next : null;
    if (data.length > 100_000) throw new Error("This event contains too many check-ins for one export.");
  }
  return { data, included };
}

// Exported for reuse by routes/weeklyPulse.ts.
export function relationshipId(resource: JsonApiResource, name: string): string {
  return text(resource.relationships?.[name]?.data?.id);
}

function birthdateFrom(attributes: Record<string, unknown>): string {
  const raw = firstValue(attributes, "birthdate", "birth_date");
  return dateOnly(raw) || raw;
}

function normalizeGrade(value: unknown): string {
  const raw = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : text(value);
  if (!raw) return "";
  const normalized = raw.toLowerCase().replace(/\s+/g, " ");
  if (["k", "kg", "kindergarten"].includes(normalized)) return "Kindergarten";
  if (["pre-k", "prek", "pre k"].includes(normalized)) return "Pre-K";
  const gradeNumber = normalized.match(/-?\d{1,2}/)?.[0];
  if (!gradeNumber) return raw;
  const n = Number(gradeNumber);
  if (n < 0) return "Pre-K";
  if (n === 0) return "Kindergarten";
  const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `${n}${suffix} Grade`;
}

// Exported for reuse by routes/weeklyPulse.ts -- same "try several plausible
// attribute names" tolerance this codebase already leans on for PCO
// resources whose exact attribute naming isn't nailed down from the outside
// (see e.g. the custom person field_data handling below), reused here for
// FormField/FormSubmissionValue, whose exact attribute names weren't fully
// confirmed from Planning Center's public docs either.
export function firstValue(attributes: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = text(attributes[name]);
    if (value) return value;
  }
  return "";
}

export function reportText(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map(reportText).filter(Boolean).join(", ");
  return text(value);
}

export function firstReportValue(attributes: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = reportText(attributes[name]);
    if (value) return value;
  }
  return "";
}

function nestedValue(attributes: Record<string, unknown>, ...names: string[]): string {
  const direct = firstReportValue(attributes, ...names);
  if (direct) return direct;
  const normalizedNames = names.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const topLevelMatch = Object.entries(attributes).find(([key]) =>
    normalizedNames.includes(key.toLowerCase().replace(/[^a-z0-9]/g, "")),
  );
  if (topLevelMatch && reportText(topLevelMatch[1])) return reportText(topLevelMatch[1]);
  for (const containerName of ["custom_fields", "customFields", "field_data", "fieldData"]) {
    const container = attributes[containerName];
    if (!container || typeof container !== "object" || Array.isArray(container)) continue;
    const values = container as Record<string, unknown>;
    for (const name of names) {
      const wanted = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const match = Object.entries(values).find(([key, value]) =>
        key.toLowerCase().replace(/[^a-z0-9]/g, "") === wanted
        || (value && typeof value === "object" && !Array.isArray(value)
          && text((value as Record<string, unknown>).name).toLowerCase().replace(/[^a-z0-9]/g, "") === wanted),
      );
      if (match) {
        const value = match[1];
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          const record = value as Record<string, unknown>;
          const result = firstReportValue(record, "value", "display_value", "displayValue", "answer");
          if (result) return result;
        } else if (reportText(value)) {
          return reportText(value);
        }
      }
    }
  }
  return "";
}

async function fetchPeopleDetails(
  ids: string[],
  accessToken: string,
  onBatchComplete?: (completedBatches: number, totalBatches: number) => void,
): Promise<Map<string, Record<string, unknown>>> {
  const result = new Map<string, Record<string, unknown>>();
  const failedIds: string[] = [];
  const totalBatches = Math.ceil(ids.length / PEOPLE_BATCH_SIZE);
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    const batch = ids.slice(batchIndex * PEOPLE_BATCH_SIZE, (batchIndex + 1) * PEOPLE_BATCH_SIZE);
    await Promise.all(batch.map(async (id) => {
      try {
        const page = await planningCenterRequest(
          `${PEOPLE_BASE}/people/${encodeURIComponent(id)}?include=emails,phone_numbers`,
          accessToken,
        );
        const attributes = { ...(page.data?.attributes ?? {}) } as Record<string, unknown>;
        const included = Array.isArray(page.included) ? page.included as JsonApiResource[] : [];
        const emails = included.filter((item) => item.type === "Email").map((item) => text(item.attributes?.address)).filter(Boolean);
        const phones = included
          .filter((item) => item.type === "PhoneNumber")
          .map((item) => ({
            number: text(item.attributes?.number),
            location: text(item.attributes?.location).toLowerCase(),
          }))
          .filter((item) => item.number);
        if (emails[0]) attributes.email = emails[0];
        const homePhone = phones.find((phone) => phone.location.includes("home"))?.number;
        const mobilePhone = phones.find((phone) => phone.location.includes("mobile") || phone.location.includes("cell"))?.number;
        if (homePhone) attributes.phone_number_home = homePhone;
        if (mobilePhone) attributes.phone_number_mobile = mobilePhone;
        if (phones[0]) attributes.phone_number = phones[0].number;
        try {
          const fieldPage = await fetchCollection(
            `${PEOPLE_BASE}/people/${encodeURIComponent(id)}/field_data?include=field_definition&per_page=100`,
            accessToken,
          );
          const definitions = new Map<string, string>(
            fieldPage.included
              .map((definition) => [
                definition.id,
                firstValue(definition.attributes ?? {}, "name", "label"),
              ]),
          );
          for (const fieldData of fieldPage.data) {
            const fieldAttributes = fieldData.attributes ?? {};
            const definitionId = relationshipId(fieldData, "field_definition");
            const fieldName = firstValue(fieldAttributes, "name", "field_name", "fieldName", "label")
              || definitions.get(definitionId)
              || "";
            const fieldValue = firstReportValue(fieldAttributes, "value", "display_value", "displayValue", "answer");
            if (fieldValue) {
              if (definitionId) attributes[`custom:${definitionId}`] = fieldValue;
              if (fieldName) attributes[fieldName] = fieldValue;
            }
          }
        } catch {
          failedIds.push(id);
          return;
        }
        result.set(id, attributes);
      } catch {
        failedIds.push(id);
      }
    }));
    onBatchComplete?.(batchIndex + 1, totalBatches);
    if (batchIndex < totalBatches - 1) {
      await new Promise((resolve) => setTimeout(resolve, PEOPLE_BATCH_DELAY_MS));
    }
  }
  if (failedIds.length) {
    const error = new Error(
      `Planning Center profile details could not be loaded for ${failedIds.length} ${failedIds.length === 1 ? "person" : "people"}. Please prepare the report again.`,
    ) as Error & { status?: number };
    error.status = 503;
    throw error;
  }
  return result;
}

function bundledPythonScript(name: ScriptSlot): string {
  const fileName = name === "month_quarter"
    ? "cleanup_attendance_month_quarter.py"
    : "cleanup_attendance_all_dates.py";
  const sourceFileName = name === "month_quarter"
    ? "cleanup_attendance_MonthQuarterv2_1788478015757.py"
    : "cleanup_attendance_all_datesv2_1788477465544.py";
  const built = join(dirname(fileURLToPath(import.meta.url)), fileName);
  const source = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../..",
    "attached_assets",
    sourceFileName,
  );
  return process.env.NODE_ENV === "production" ? built : source;
}

async function pythonScript(name: ScriptSlot): Promise<string> {
  const rows = await db.select().from(reportScriptsTable)
    .where(eq(reportScriptsTable.slot, name))
    .limit(1);
  if (!rows[0]) return bundledPythonScript(name);
  try {
    return (await storage.getObjectEntityFile(rows[0].objectPath)).path;
  } catch {
    const error = new Error(`The uploaded ${SCRIPT_SLOTS.find((item) => item.slot === name)?.label ?? name} script is unavailable. Upload it again or reset it to the bundled version.`) as Error & { status?: number };
    error.status = 500;
    throw error;
  }
}

// trendWeeks: how many weeks of the saved attendance tracker the report's
// trend charts show -- 13 (a quarter) for monthly reports, 26 (this quarter
// and the one before) for quarterly ones, whose own weeks already cover 13.
const REPORT_ENGINES: Array<{ engine: ReportEngine; label: string; script: string; args: string[]; trendWeeks: number }> = [
  { engine: "youth_quarterly", label: "Youth Quarterly Report", script: "report_youth.py", args: ["--period", "quarterly"], trendWeeks: 26 },
  { engine: "youth_monthly", label: "Youth Monthly Report", script: "report_youth.py", args: ["--period", "monthly"], trendWeeks: 13 },
  { engine: "kids_rutherford", label: "Kids Rutherford Report", script: "report_kids.py", args: ["--campus", "rutherford"], trendWeeks: 13 },
  { engine: "kids_lyndhurst", label: "Kids Lyndhurst Report", script: "report_kids.py", args: ["--campus", "lyndhurst"], trendWeeks: 13 },
  { engine: "kids_rutherford_quarterly", label: "Kids Rutherford Quarterly Report", script: "report_kids.py", args: ["--campus", "rutherford", "--period", "quarterly"], trendWeeks: 26 },
  { engine: "kids_lyndhurst_quarterly", label: "Kids Lyndhurst Quarterly Report", script: "report_kids.py", args: ["--campus", "lyndhurst", "--period", "quarterly"], trendWeeks: 26 },
];

function isReportEngine(value: unknown): value is ReportEngine {
  return typeof value === "string" && REPORT_ENGINES.some((item) => item.engine === value);
}

function reportEngineDefinition(engine: ReportEngine) {
  return REPORT_ENGINES.find((item) => item.engine === engine)!;
}

// Bundled report-engine scripts are never admin-uploadable (unlike the
// SCRIPT_SLOTS above) -- they always ship with the API server, mirroring
// bundledPythonScript's dev/production path resolution above.
function bundledReportEngineScript(fileName: string): string {
  const built = join(dirname(fileURLToPath(import.meta.url)), fileName);
  const source = join(dirname(fileURLToPath(import.meta.url)), "../../../..", "attached_assets", fileName);
  return process.env.NODE_ENV === "production" ? built : source;
}

// The cleanup script's runtime scales with how many check-in rows it has to
// process, which varies a lot by event size -- a fixed timeout either kills
// a legitimately large pull early or leaves a hung process running far
// longer than any real cleanup should need. Scale the budget with the row
// count instead: a generous per-row allowance, a floor so small pulls still
// get a reasonable cushion, and a hard ceiling so a genuinely stuck script
// can't hold the single shared container hostage indefinitely.
//
// 2026-10-01: a ~1,300-row report hit this budget's exact boundary and got
// killed (193.9s wall, 193,950ms at the old 150ms/row rate) -- the real
// driver was find_near_matches() in the cleanup script doing an O(n^2)
// all-pairs fuzzy-name comparison, since fixed there (bucketed by name
// initial, ~5-20x fewer comparisons, same results -- see that script's
// comments). Per-row allowance raised here too, as headroom: the
// algorithmic fix removes the quadratic blowup, but Python startup + CSV
// I/O + the now-bucketed comparisons still cost more than 150ms/row once
// bundle sizes get into the thousands.
const CLEANUP_TIMEOUT_FLOOR_MS = 120_000;
const CLEANUP_TIMEOUT_PER_ROW_MS = 250;
const CLEANUP_TIMEOUT_CEILING_MS = 15 * 60_000;

function cleanupScriptTimeoutMs(rowCount: number): number {
  return Math.min(
    CLEANUP_TIMEOUT_CEILING_MS,
    Math.max(CLEANUP_TIMEOUT_FLOOR_MS, rowCount * CLEANUP_TIMEOUT_PER_ROW_MS),
  );
}

// Resolve python3 by its absolute path inside the uv-managed venv rather
// than relying on a PATH lookup.
//
// 2026-10-01: prepare/report runs started failing instantly with
// "spawn python3 ENOENT". The Dockerfile's runtime stage does
// `ENV PATH="/app/.venv/bin:${PATH}"` so a bare `spawn("python3", ...)`
// should resolve -- but src/worker.ts's Container class now sets a fixed
// `envVars` object on every container start (added 2026-09-30 for the R2
// storage bridging work), and that object doesn't include PATH. Whether
// Cloudflare Containers merges that into the image's PATH or replaces it
// outright isn't documented, and this environment makes it hard to
// confirm directly -- but the symptom (ENOENT firing immediately, never
// after real work, only starting right after that change shipped) matches
// a PATH that no longer has /app/.venv/bin on it. Spawning the venv's
// python3 by absolute path removes the PATH dependency entirely, so this
// can't recur regardless of how that env plumbing actually behaves.
// PYTHON3_BIN lets this be overridden (e.g. for local dev outside the
// venv) without touching the spawn call itself.
const PYTHON3_BIN = process.env.PYTHON3_BIN || "/app/.venv/bin/python3";

async function runPython(args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON3_BIN, args, {
      env: { ...process.env, PATH: `/app/.venv/bin:${process.env.PATH ?? ""}` },
    });
    let output = "";
    let errorOutput = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Report processing timed out."));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { errorOutput += chunk.toString(); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error((errorOutput || output || "Report script failed.").slice(-4000)));
    });
  });
}

async function cleanExpiredRuns() {
  const expired = await db.select().from(reportRunsTable).where(lt(reportRunsTable.expiresAt, new Date())).limit(50);
  for (const run of expired) await storage.deleteObjectEntity(run.cleanedObjectPath).catch(() => undefined);
  if (expired.length) {
    await db.delete(reportRunsTable).where(lt(reportRunsTable.expiresAt, new Date()));
  }
}

function sendError(req: Request, res: Response, error: unknown, fallback: string) {
  const typed = error as Error & { status?: number; details?: string };
  req.log.error({ err: error, details: typed.details }, fallback);
  res.status(typed.status ?? 500).json({ error: typed.message || fallback });
}

export type ReportLog = { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };

export type PreparedReport = {
  runId: string;
  eventName: string;
  rawRows: number;
  peopleCount: number;
  serviceDates: string[];
  sessionCount: number;
  // Week dates nobody checked in to: shown as 0, not counted in rates.
  skippedDates: string[];
  pullFields: ReportFieldKey[];
  pullFieldLabels: string[];
  reviewCount: number;
  flags: string;
  expiresAt: string;
};

function reportError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

export const MAX_JOINED_EVENTS = 10;

// The Check-Ins event ids a prepare request asks for: `eventIds` (array or
// comma-separated string) or the older single `eventId`; de-duplicated.
export function parseEventIds(body: unknown): string[] {
  const source = body as { eventIds?: unknown; eventId?: unknown } | null | undefined;
  const raw = source?.eventIds ?? source?.eventId;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  return [...new Set(list.map((value) => text(value)).filter(Boolean))];
}

// One event's periods, attendee check-ins (with people) and first-time
// check-ins, straight from Planning Center.
async function loadEventData(eventId: string, accessToken: string): Promise<EventData> {
  const eventPage = await planningCenterRequest(`${CHECK_INS_BASE}/events/${encodeURIComponent(eventId)}`, accessToken);
  const eventName = firstValue(eventPage.data?.attributes ?? {}, "name") || `Event ${eventId}`;
  const [periodCollection, collection, firstTimeCollection] = await Promise.all([
    fetchCollection(
      `${CHECK_INS_BASE}/events/${encodeURIComponent(eventId)}/event_periods?order=-starts_at&per_page=100`,
      accessToken,
    ),
    fetchCollection(
      `${CHECK_INS_BASE}/events/${encodeURIComponent(eventId)}/check_ins?filter=attendee&include=person&per_page=100`,
      accessToken,
    ),
    fetchCollection(
      `${CHECK_INS_BASE}/events/${encodeURIComponent(eventId)}/check_ins?filter=first_time&per_page=100`,
      accessToken,
    ),
  ]);
  return {
    eventId,
    eventName,
    periods: periodCollection.data,
    checkIns: collection.data,
    included: collection.included,
    firstTime: firstTimeCollection.data,
  };
}

// Only the sessions of `weekStart` for a week-copy's source event: its
// periods that week and their check-ins (read-only calls).
async function loadSourceWeek(
  sourceEventId: string,
  sourceEventName: string,
  weekStart: string,
  accessToken: string,
): Promise<EventData> {
  const periodCollection = await fetchCollection(
    `${CHECK_INS_BASE}/events/${encodeURIComponent(sourceEventId)}/event_periods?order=-starts_at&per_page=100`,
    accessToken,
  );
  const periods = periodsInWeek(periodCollection.data, weekStart);
  const checkIns: EventData["checkIns"] = [];
  const included: EventData["included"] = [];
  const firstTime: EventData["firstTime"] = [];
  for (const period of periods) {
    const base = `${CHECK_INS_BASE}/events/${encodeURIComponent(sourceEventId)}/event_periods/${encodeURIComponent(period.id)}/check_ins`;
    const attendees = await fetchCollection(`${base}?filter=attendee&include=person&per_page=100`, accessToken);
    const firstTimers = await fetchCollection(`${base}?filter=first_time&per_page=100`, accessToken);
    checkIns.push(...attendees.data);
    included.push(...attendees.included);
    firstTime.push(...firstTimers.data);
  }
  return { eventId: sourceEventId, eventName: sourceEventName, periods, checkIns, included, firstTime };
}

router.get("/events", requireToolAccess("reporting"), async (req, res) => {
  try {
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    const collection = await fetchCollection(
      `${CHECK_INS_BASE}/events?filter=not_archived&order=name&per_page=100`,
      accessToken,
    );
    res.json(collection.data.map((event) => ({
      id: event.id,
      name: firstValue(event.attributes ?? {}, "name") || `Event ${event.id}`,
      frequency: firstValue(event.attributes ?? {}, "frequency"),
    })));
  } catch (error) {
    sendError(req, res, error, "Failed to load Planning Center events");
  }
});

router.get("/fields", requireToolAccess("reporting"), async (req, res) => {
  try {
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    const customFields = await fetchReportFieldDefinitions(accessToken);
    res.json({
      standardFields: REPORT_FIELDS,
      planningCenterFields: customFields,
    });
  } catch (error) {
    sendError(req, res, error, "Failed to load Planning Center fields");
  }
});

router.get("/scripts", requireAdmin, async (_req, res) => {
  const rows = await db.select().from(reportScriptsTable);
  const bySlot = new Map(rows.map((row) => [row.slot, row]));
  res.json(SCRIPT_SLOTS.map(({ slot, label }) => {
    const row = bySlot.get(slot);
    return {
      slot,
      label,
      source: row ? "uploaded" : "bundled",
      originalFileName: row?.originalFileName ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }));
});

router.put("/scripts/:slot", requireAdmin, async (req, res) => {
  try {
    const slot = text(req.params.slot) as ScriptSlot;
    const originalFileName = text(req.body?.originalFileName);
    const objectPath = text(req.body?.objectPath);
    if (!SCRIPT_SLOTS.some((item) => item.slot === slot)) {
      res.status(400).json({ error: "Invalid report script type." });
      return;
    }
    if (!originalFileName.toLowerCase().endsWith(".py") || !objectPath.startsWith("/objects/")) {
      res.status(400).json({ error: "Upload a valid Python (.py) file." });
      return;
    }
    const file = await storage.getObjectEntityFile(objectPath);
    const fileStats = await stat(file.path);
    if (!fileStats.size || fileStats.size > MAX_SCRIPT_BYTES) {
      res.status(400).json({ error: "Python scripts must be between 1 byte and 500 KB." });
      return;
    }
    await runPython([
      "-c",
      "import sys; compile(open(sys.argv[1], 'rb').read(), sys.argv[1], 'exec')",
      file.path,
    ], 15_000);

    const existing = await db.select().from(reportScriptsTable)
      .where(eq(reportScriptsTable.slot, slot))
      .limit(1);
    const rows = await db.insert(reportScriptsTable).values({
      slot,
      originalFileName,
      objectPath,
      uploadedByUserId: res.locals.dbUser.id,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: reportScriptsTable.slot,
      set: {
        originalFileName,
        objectPath,
        uploadedByUserId: res.locals.dbUser.id,
        updatedAt: new Date(),
      },
    }).returning();
    if (existing[0]?.objectPath && existing[0].objectPath !== objectPath) {
      await storage.deleteObjectEntity(existing[0].objectPath).catch(() => undefined);
    }
    const { objectPath: _objectPath, uploadedByUserId: _uploadedByUserId, ...response } = rows[0];
    res.json({ ...response, label: SCRIPT_SLOTS.find((item) => item.slot === slot)?.label, source: "uploaded" });
  } catch (error) {
    sendError(req, res, error, "Failed to update report script");
  }
});

router.delete("/scripts/:slot", requireAdmin, async (req, res) => {
  try {
    const slot = text(req.params.slot) as ScriptSlot;
    if (!SCRIPT_SLOTS.some((item) => item.slot === slot)) {
      res.status(400).json({ error: "Invalid report script type." });
      return;
    }
    const rows = await db.delete(reportScriptsTable)
      .where(eq(reportScriptsTable.slot, slot))
      .returning();
    if (rows[0]?.objectPath) await storage.deleteObjectEntity(rows[0].objectPath).catch(() => undefined);
    res.status(204).end();
  } catch (error) {
    sendError(req, res, error, "Failed to reset report script");
  }
});

router.get("/templates", requireToolAccess("reporting"), async (_req, res) => {
  const rows = await db.select().from(reportTemplatesTable).orderBy(reportTemplatesTable.name);
  res.json(rows.map(({ objectPath: _objectPath, pullFields, ...row }) => ({
    ...row,
    pullFields: normalizePullFields(pullFields),
  })));
});

router.post("/templates", requireAdmin, async (req, res) => {
  try {
    const name = text(req.body?.name);
    if (!name) {
      res.status(400).json({ error: "A template name is required." });
      return;
    }
    const engineRaw = text(req.body?.engine);
    if (!isReportEngine(engineRaw)) {
      res.status(400).json({ error: "A valid report engine is required." });
      return;
    }
    const rows = await db.insert(reportTemplatesTable).values({
      name,
      originalFileName: null,
      objectPath: null,
      engine: engineRaw,
      pullFields: JSON.stringify(DEFAULT_PULL_FIELDS),
      sessionCount: DEFAULT_SESSION_COUNT,
      cleanupMode: "month_quarter",
      uploadedByUserId: res.locals.dbUser.id,
    }).returning();
    res.status(201).json({
      ...rows[0],
      objectPath: undefined,
      pullFields: normalizePullFields(rows[0].pullFields),
    });
  } catch (error) {
    sendError(req, res, error, "Failed to save report template");
  }
});

router.patch("/templates/:templateId/settings", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.templateId);
    if (!Number.isInteger(templateId)) {
      res.status(400).json({ error: "Invalid template." });
      return;
    }
    const pullFields = normalizePullFields(req.body?.pullFields);
    const sessionCount = Number(req.body?.sessionCount);
    const name = text(req.body?.name);
    const cleanupMode = normalizeCleanupMode(req.body?.cleanupMode);
    if (!name) {
      res.status(400).json({ error: "Template name is required." });
      return;
    }
    if (!Number.isInteger(sessionCount) || sessionCount < 1 || sessionCount > MAX_SESSION_COUNT) {
      res.status(400).json({ error: `Session count must be between 1 and ${MAX_SESSION_COUNT}.` });
      return;
    }
    const rows = await db.update(reportTemplatesTable)
      .set({ name, pullFields: JSON.stringify(pullFields), sessionCount, cleanupMode })
      .where(eq(reportTemplatesTable.id, templateId))
      .returning();
    if (!rows[0]) {
      res.status(404).json({ error: "Template not found." });
      return;
    }
    const { objectPath: _objectPath, pullFields: storedFields, ...template } = rows[0];
    res.json({ ...template, pullFields: normalizePullFields(storedFields) });
  } catch (error) {
    sendError(req, res, error, "Failed to update report template settings");
  }
});

router.delete("/templates/:templateId", requireAdmin, async (req, res) => {
  try {
    const templateId = Number(req.params.templateId);
    const rows = await db.delete(reportTemplatesTable)
      .where(eq(reportTemplatesTable.id, templateId))
      .returning();
    if (!rows[0]) {
      res.status(404).json({ error: "Template not found." });
      return;
    }
    if (rows[0].objectPath) await storage.deleteObjectEntity(rows[0].objectPath).catch(() => undefined);
    res.status(204).end();
  } catch (error) {
    sendError(req, res, error, "Failed to delete report template");
  }
});

router.get("/prepare-progress/:progressId", requireToolAccess("reporting"), (req, res) => {
  cleanPreparationProgress();
  const progressId = text(req.params.progressId);
  const progress = preparationProgress.get(progressKey(res.locals.dbUser.id, progressId));
  if (!progress) {
    res.json({
      stage: "loading",
      completedBatches: 0,
      totalBatches: 0,
      message: "Loading attendance data…",
    });
    return;
  }
  const { expiresAt: _expiresAt, ...response } = progress;
  res.json(response);
});

export async function prepareReportRun(
  body: Record<string, unknown>,
  userId: string,
  log: ReportLog,
): Promise<PreparedReport> {
  let workDir = "";
  const progressId = text(body?.progressId);
  if (activePrepareRuns.has(userId)) throw reportError(409, PREPARE_IN_PROGRESS_MESSAGE);
  activePrepareRuns.add(userId);
  try {
    await cleanExpiredRuns();
    cleanPreparationProgress();
    if (progressId) {
      setPreparationProgress(userId, progressId, {
        stage: "loading",
        completedBatches: 0,
        totalBatches: 0,
        message: "Loading attendance data…",
      });
    }
    const eventIdList = parseEventIds(body);
    const eventId = eventIdList.join(",");
    const requestedStartDate = dateOnly(body?.startDate);
    const endDate = dateOnly(body?.endDate);
    const templateId = Number(body?.templateId);
    if (!eventId || !endDate || !Number.isInteger(templateId)) {
      throw reportError(400, "Select an event, template, and valid end date.");
    }
    if (eventIdList.length > MAX_JOINED_EVENTS) {
      throw reportError(400, `Join at most ${MAX_JOINED_EVENTS} events in one report.`);
    }

    const templates = await db.select().from(reportTemplatesTable)
      .where(eq(reportTemplatesTable.id, templateId))
      .limit(1);
    const template = templates[0];
    if (!template) {
      throw reportError(404, "Report template not found.");
    }
    const pullFields = normalizePullFields(template.pullFields);
    const sessionCount = normalizeSessionCount(template.sessionCount);
    const cleanupMode = normalizeCleanupMode(template.cleanupMode);
    // "range": every session from startDate through endDate (a calendar
    // month/quarter/week, so 4- and 5-week months both come out whole)
    // instead of the template's last N sessions. All Dates templates are
    // always a range. Added 2026-10-14 for previous-month/quarter defaults
    // and scheduled reports.
    const useRange = cleanupMode === "all_dates" || text(body?.period) === "range";
    if (useRange && cleanupMode !== "all_dates" && (!requestedStartDate || requestedStartDate > endDate)) {
      throw reportError(400, "Select a valid start and end date for this report period.");
    }
    if (cleanupMode === "all_dates" && (!requestedStartDate || requestedStartDate > endDate)) {
      throw reportError(400, "Select a valid start and end date for an All Dates template.");
    }
    const accessToken = await getValidPlanningCenterAccessToken(userId);
    // Audit finding 1.12 (Medium): this always fetched the full, paginated
    // list of Planning Center custom field definitions, even when the
    // report template doesn't pull any custom fields -- selectedCustomFields
    // is computed from the same pullFields list and was already knowable
    // before paying for that fetch. customLabels stays an empty Map in that
    // case, which is exactly what it would have evaluated to anyway (no
    // custom field key in pullFields to look up a label for).
    const selectedCustomFields = pullFields.filter(isCustomFieldKey);
    const customFieldDefinitions = selectedCustomFields.length
      ? await fetchReportFieldDefinitions(accessToken)
      : [];
    const customLabels = new Map(customFieldDefinitions.map((field) => [field.key, field.label]));
    const loadedEvents: EventData[] = [];
    for (const id of eventIdList) loadedEvents.push(await loadEventData(id, accessToken));
    const sessionOptions = { endDate, cleanupMode: useRange ? "all_dates" as const : cleanupMode, startDate: requestedStartDate, sessionCount };

    // Week copies ("use event Y's check-ins for the week of W"): swap in the
    // source event's check-ins for any copied week that could be in this
    // report. Planning Center is only read, never written.
    const rawSessions = pickSessions(loadedEvents.flatMap((event) => event.periods), sessionOptions);
    const copyWindowStart = useRange
      ? weekStartFor(`${requestedStartDate}T12:00:00Z`)
      : rawSessions.length >= sessionCount
        ? addDays(weekStartFor(`${rawSessions[0].date}T12:00:00Z`), -7)
        : "0000-00-00";
    const copyWindowEnd = weekStartFor(`${endDate}T12:00:00Z`);
    const weekCopies = (await readWeekOverrides())
      .filter((copy) => copy.weekStart >= copyWindowStart && copy.weekStart <= copyWindowEnd);
    const sourceWeekCache = new Map<string, EventData>();
    const preparedEvents: EventData[] = [];
    for (const event of loadedEvents) {
      let data = event;
      for (const copy of weekCopies.filter((item) => item.eventId === event.eventId)) {
        const cacheKey = `${copy.sourceEventId}:${copy.weekStart}`;
        let source = sourceWeekCache.get(cacheKey);
        if (!source) {
          source = await loadSourceWeek(copy.sourceEventId, copy.sourceEventName, copy.weekStart, accessToken);
          sourceWeekCache.set(cacheKey, source);
        }
        data = applyWeekCopy(data, copy.weekStart, source);
      }
      preparedEvents.push(data);
    }
    const combined = mergeEventData(preparedEvents);
    const eventName = combined.eventName;

    // Weeks with a Planning Center session but no attendee check-ins (a
    // break week) stay in the report as a 0 week -- shown as "0 (week off)"
    // in the weekly bar chart -- but the cleanup scripts and engines leave
    // them out of attendance rates (Andrew, 2026-10-14). See pickHeldSessions.
    const { sessions, skippedDates } = pickHeldSessions(combined.periods, combined.checkIns, sessionOptions);
    if (skippedDates.length) log.info({ skippedDates }, "Report weeks with no check-ins (not counted in rates)");
    if (!sessions.length) {
      throw reportError(404, skippedDates.length
        ? `The Planning Center sessions in this period had no check-ins (${skippedDates.join(", ")}).`
        : useRange
          ? "No Planning Center sessions were found in that date range."
          : "No Planning Center sessions were found on or before that end date.");
    }
    const selectedSessionIds = new Set(sessions.flatMap((session) => session.periodIds));
    const sessionDateById = new Map(sessions.flatMap((session) => session.periodIds.map((id) => [id, session.date] as const)));
    const firstTimeIds = new Set(combined.firstTime.map((checkIn) => checkIn.id));
    const inRange = combined.checkIns.filter((checkIn) =>
      selectedSessionIds.has(relationshipId(checkIn, "event_period")),
    );
    if (!inRange.length) {
      throw reportError(404, "No attendee check-ins were found in the selected sessions.");
    }
    const reportFirstTimerIds = reportFirstTimers(combined, inRange);

    const includedPeople = new Map(
      combined.included.filter((resource) => resource.id).map((resource) => [resource.id, resource.attributes ?? {}]),
    );
    const personIds = [...new Set(inRange.map((checkIn) => relationshipId(checkIn, "person")).filter(Boolean))];
    // Person details come from the weekly people sync's table; only people
    // it can't answer for are looked up live (see lib/reportPeople.ts).
    const peopleLookup = await lookupReportPeople(personIds, includedPeople, selectedCustomFields);
    const liveIds = peopleLookup.live;
    const totalProfileBatches = Math.ceil(liveIds.length / PEOPLE_BATCH_SIZE);
    log.info(
      { people: personIds.length, fromTable: peopleLookup.fromTable.size, live: liveIds.length, reason: peopleLookup.reason },
      "Report people lookup",
    );
    if (progressId) {
      setPreparationProgress(userId, progressId, {
        stage: "profiles",
        completedBatches: 0,
        totalBatches: totalProfileBatches,
        message: liveIds.length
          ? `Loading ${liveIds.length} new or updated ${liveIds.length === 1 ? "profile" : "profiles"} from Planning Center…`
          : "Loaded profiles from the saved people list",
      });
    }
    const liveDetails = liveIds.length
      ? await fetchPeopleDetails(liveIds, accessToken, (completedBatches, totalBatches) => {
        if (progressId) {
          setPreparationProgress(userId, progressId, {
            stage: "profiles",
            completedBatches,
            totalBatches,
            message: `Loaded profile batch ${completedBatches} of ${totalBatches}`,
          });
        }
      })
      : new Map<string, Record<string, unknown>>();
    const peopleDetails = new Map<string, Record<string, unknown>>(peopleLookup.fromTable);
    for (const [id, attributes] of liveDetails) peopleDetails.set(id, stripContactAttributes(attributes));
    const serviceDates = sessions.map((session) => session.date);
    const startDate = useRange ? requestedStartDate : serviceDates[0];
    const records = new Map<string, Record<string, string | boolean>>();

    for (const checkIn of inRange) {
      const attrs = checkIn.attributes ?? {};
      const personId = relationshipId(checkIn, "person");
      const person = stripContactAttributes({ ...(includedPeople.get(personId) ?? {}), ...(peopleDetails.get(personId) ?? {}) });
      const firstName = firstValue(attrs, "first_name") || firstValue(person, "first_name", "given_name");
      const lastName = firstValue(attrs, "last_name") || firstValue(person, "last_name", "family_name");
      const key = personId || `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
      const current = records.get(key) ?? {
        "Planning Center ID": personId,
        "First Name": firstName,
        "Last Name": lastName,
        "Birthdate": birthdateFrom(person),
        "Email": firstValue(person, "email", "primary_email"),
        "Phone Number (home)": firstValue(person, "phone_number_home", "home_phone_number", "phone_home"),
        "Phone Number (mobile)": firstValue(person, "phone_number_mobile", "mobile_phone_number", "primary_phone_number", "phone_number"),
        "Primary Contact Name": nestedValue(person, "primary_contact_name", "primary contact name"),
        "Primary Contact Email": nestedValue(person, "primary_contact_email", "primary contact email"),
        "Gender": firstValue(person, "gender"),
        "Grade": normalizeGrade(person.grade),
        "First Timers": "",
        "Completed Thrive": nestedValue(person, "completed_thrive", "completed thrive"),
        "Baptized?": nestedValue(person, "baptized", "baptized?"),
        "Last served": nestedValue(person, "last_served", "last served"),
      };
      for (const customField of selectedCustomFields) {
        current[fieldLabel(customField, customLabels)] = firstReportValue(person, customField);
      }
      // Per person, judged across all of the report's events (see
      // reportFirstTimers); the raw per-check-in flag only for the rare
      // check-in with no person attached.
      const firstTimer = personId
        ? reportFirstTimerIds.has(personId)
        : firstTimeIds.has(checkIn.id) || attrs.first_time === true || attrs.first_time_in_event === true;
      if (firstTimer) current["First Timers"] = "First-timer";
      const sessionDate = sessionDateById.get(relationshipId(checkIn, "event_period"));
      if (sessionDate) current[sessionDate] = true;
      records.set(key, current);
    }

    // Keep the attendance tracker (checkins_weekly_history) current for this
    // event: the check-ins fetched above already cover its full history, so
    // the last year of weeks is recomputed and saved here at no extra
    // Planning Center cost. The report's trend chart reads these rows back
    // at generate time. Best-effort -- a tracker problem never blocks the
    // report itself.
    try {
      const sinceWeek = addDays(weekStartFor(`${endDate}T12:00:00Z`), -7 * 52);
      for (const event of loadedEvents) {
        const periodStartById = new Map<string, string>();
        for (const period of event.periods) {
          const startsAt = text(period.attributes?.starts_at);
          if (period.id && startsAt) periodStartById.set(period.id, startsAt);
        }
        const historyRows = buildWeeklyHistory(
          event.checkIns,
          periodStartById,
          genderByPersonFromIncluded(event.included),
          sinceWeek,
          new Date(),
          event.firstTime,
        );
        await saveHistoryRows({ eventId: event.eventId, eventName: event.eventName, archived: false }, historyRows);
      }
    } catch (error) {
      log.warn({ err: error, eventId }, "Could not refresh the attendance tracker for this event");
    }

    const headers = [
      ...REPORT_FIELDS.map((field) => field.label),
      ...selectedCustomFields.map((field) => fieldLabel(field, customLabels)),
      ...serviceDates,
    ];
    const rawCsv = [
      headers.map(csv).join(","),
      ...[...records.values()].map((record) => headers.map((header) =>
        serviceDates.includes(header) ? (record[header] ? "TRUE" : "FALSE") : csv(record[header]),
      ).join(",")),
    ].join("\n");

    workDir = await mkdtemp(join(tmpdir(), "tc-report-"));
    const rawPath = join(workDir, "raw.csv");
    const cleanedPath = join(workDir, "cleaned.csv");
    const flagsPath = join(workDir, "flags.txt");
    await writeFile(rawPath, rawCsv, "utf8");
    const output = await runPython(
      [await pythonScript(cleanupMode), rawPath, cleanedPath, "--flags-out", flagsPath],
      cleanupScriptTimeoutMs(inRange.length),
    );
    const cleaned = selectCleanedColumns(await readFile(cleanedPath, "utf8"), pullFields, customLabels);
    const flags = await readFile(flagsPath, "utf8").catch(() => "");
    const cleanedObjectPath = await storage.saveObjectEntityBuffer(Buffer.from(cleaned, "utf8"), "text/csv", "reports");
    const runId = randomUUID();
    const expiresAt = new Date(Date.now() + REPORT_TTL_MS);
    await db.insert(reportRunsTable).values({
      id: runId,
      eventId,
      eventName,
      startDate,
      endDate,
      templateId,
      cleanedObjectPath,
      requestedByUserId: userId,
      expiresAt,
    });
    const reviewCount = Number(output.match(/ENTRIES NEEDING YOUR REVIEW:\s*(\d+)/)?.[1] ?? 0);
    if (progressId) {
      setPreparationProgress(userId, progressId, {
        stage: "complete",
        completedBatches: totalProfileBatches,
        totalBatches: totalProfileBatches,
        message: "All profile batches loaded",
      });
    }
    return {
      runId,
      eventName,
      rawRows: inRange.length,
      peopleCount: records.size,
      serviceDates,
      sessionCount: sessions.length,
      skippedDates,
      pullFields,
      pullFieldLabels: pullFields.map((field) => fieldLabel(field, customLabels)),
      reviewCount,
      flags,
      expiresAt: expiresAt.toISOString(),
    };
  } catch (error) {
    if (progressId) {
      const current = preparationProgress.get(progressKey(userId, progressId));
      setPreparationProgress(userId, progressId, {
        stage: "failed",
        completedBatches: current?.completedBatches ?? 0,
        totalBatches: current?.totalBatches ?? 0,
        message: "Report preparation stopped",
      });
    }
    throw error;
  } finally {
    activePrepareRuns.delete(userId);
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

router.post("/prepare", requireToolAccess("reporting"), async (req, res) => {
  try {
    res.json(await prepareReportRun(req.body ?? {}, res.locals.dbUser.id, req.log));
  } catch (error) {
    sendError(req, res, error, "Failed to prepare report data");
  }
});

// Renders a prepared run to PDF with its template's engine. Shared by the
// download (POST /generate) and email (POST /email-pdf) routes.
async function generateReportPdf(
  runId: string,
  templateId: number,
  userId: string,
): Promise<{ pdf: Buffer; fileName: string; run: typeof reportRunsTable.$inferSelect; templateName: string }> {
  const fail = (status: number, message: string): never => {
    const error = new Error(message) as Error & { status?: number };
    error.status = status;
    throw error;
  };
  const runs = await db.select().from(reportRunsTable).where(and(
    eq(reportRunsTable.id, runId),
    eq(reportRunsTable.requestedByUserId, userId),
  )).limit(1);
  const templates = await db.select().from(reportTemplatesTable).where(eq(reportTemplatesTable.id, templateId)).limit(1);
  const run = runs[0];
  const template = templates[0];
  if (!run || run.expiresAt < new Date()) fail(410, "This prepared report expired. Prepare the data again.");
  if (!template) fail(404, "Report template not found.");
  if (run!.templateId !== templateId) fail(409, "This report was prepared for a different template. Prepare the data again.");

  const workDir = await mkdtemp(join(tmpdir(), "tc-report-output-"));
  try {
    const cleanedFile = await storage.getObjectEntityFile(run!.cleanedObjectPath);
    const cleanedPath = join(workDir, "cleaned.csv");
    const pdfPath = join(workDir, "report.pdf");
    await writeFile(cleanedPath, await readFile(cleanedFile.path));

    if (!isReportEngine(template!.engine)) {
      // Every template is created with one of the built-in engines now
      // (see POST /templates) -- the legacy upload-your-own-xlsx +
      // LibreOffice pipeline was removed, so a template with no engine set
      // is just a broken/legacy row that can't be rendered anymore.
      fail(422, "This report template has no engine configured.");
    }
    const definition = reportEngineDefinition(template!.engine as Parameters<typeof reportEngineDefinition>[0]);
    // Attendance trend: the last 13 weeks for this event from the saved
    // tracker (refreshed at prepare time). Without at least two weeks the
    // engine falls back to the report's own weeks.
    const trendArgs: string[] = [];
    try {
      const trendRows = await loadTrendRowsForEvents(run!.eventId.split(","), run!.endDate, definition.trendWeeks);
      if (trendRows.length >= 2) {
        const trendPath = join(workDir, "trend.json");
        await writeFile(trendPath, JSON.stringify(trendRows));
        trendArgs.push("--trend-json", trendPath);
      }
    } catch (error) {
      console.warn("Attendance trend unavailable; using the report's own weeks.", error);
    }
    await runPython([
      bundledReportEngineScript(definition.script),
      ...definition.args,
      "--data", cleanedPath,
      "--out-pdf", pdfPath,
      ...trendArgs,
    ], 180_000);
    const engineStats = await stat(pdfPath).catch(() => null);
    if (!engineStats?.isFile() || engineStats.size === 0) fail(422, "The report engine did not create a PDF.");
    return {
      pdf: await readFile(pdfPath),
      fileName: `${safeFilePart(run!.eventName)}-${run!.startDate}-to-${run!.endDate}.pdf`,
      run: run!,
      templateName: template!.name,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

router.post("/generate", requireToolAccess("reporting"), async (req, res) => {
  try {
    const runId = text(req.body?.runId);
    const templateId = Number(req.body?.templateId);
    const format = text(req.body?.format).toLowerCase();
    if (!runId || !Number.isInteger(templateId) || format !== "pdf") {
      res.status(400).json({ error: "Report run, template, and output format (pdf) are required." });
      return;
    }
    const { pdf, fileName } = await generateReportPdf(runId, templateId, res.locals.dbUser.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(pdf);
  } catch (error) {
    sendError(req, res, error, "Failed to generate report");
  }
});

export const MAX_REPORT_EMAIL_RECIPIENTS = 10;
const RECIPIENT_EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

// Accepts an array or a comma/semicolon/space-separated string; returns the
// de-duplicated, lower-cased addresses, or an error message.
export function parseReportRecipients(raw: unknown): { recipients: string[] } | { error: string } {
  const parts = (Array.isArray(raw) ? raw : [raw])
    .flatMap((value) => (typeof value === "string" ? value.split(/[\s,;]+/) : []))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const recipients = [...new Set(parts)];
  if (!recipients.length) return { error: "Add at least one email address." };
  const invalid = recipients.find((address) => !RECIPIENT_EMAIL.test(address));
  if (invalid) return { error: `"${invalid}" isn't a valid email address.` };
  if (recipients.length > MAX_REPORT_EMAIL_RECIPIENTS) {
    return { error: `Send to at most ${MAX_REPORT_EMAIL_RECIPIENTS} people at once.` };
  }
  return { recipients };
}

// Renders a prepared run and emails the PDF. Shared by POST /email-pdf and
// scheduled reports (routes/scheduledReports.ts). `senderLine` is the
// small-print line saying who/what sent it.
export async function emailReportPdf(
  runId: string,
  templateId: number,
  userId: string,
  recipients: string[],
  senderLine: string,
): Promise<{ sent: boolean; error?: string; fileName: string }> {
  const { pdf, fileName, run, templateName } = await generateReportPdf(runId, templateId, userId);
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const result = await sendEmail({
    to: recipients,
    subject: `${templateName}: ${run.eventName} (${run.startDate} to ${run.endDate})`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#111827;">
        <p>The <strong>${escape(templateName)}</strong> report for <strong>${escape(run.eventName)}</strong>
        (${escape(run.startDate)} to ${escape(run.endDate)}) is attached as a PDF.</p>
        <p style="font-size:13px;color:#6b7280;">${escape(senderLine)}
        This report contains attendee names, so please don't forward it outside the team.</p>
      </div>`,
    attachments: [{ filename: fileName, content: pdf }],
  });
  return { sent: result.sent, error: result.error, fileName };
}

// ── POST /api/reports/email-pdf ─────────────────────────────────────────────
// Body: { runId, templateId, recipients }. Renders the same PDF as
// /generate and emails it as an attachment. The report lists people
// (including children) by name, so the send is logged with who sent it and
// how many recipients, and the recipient count is capped.
router.post("/email-pdf", requireToolAccess("reporting"), async (req, res) => {
  try {
    const runId = text(req.body?.runId);
    const templateId = Number(req.body?.templateId);
    if (!runId || !Number.isInteger(templateId)) {
      res.status(400).json({ error: "Report run and template are required." });
      return;
    }
    const parsed = parseReportRecipients(req.body?.recipients);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const sender = [res.locals.dbUser.firstName, res.locals.dbUser.lastName].filter(Boolean).join(" ") || "A Transform Church admin";
    const result = await emailReportPdf(runId, templateId, res.locals.dbUser.id, parsed.recipients, `Sent by ${sender} from the Transform Church reporting page.`);
    req.log.info(
      { runId, templateId, actorId: res.locals.dbUser.id, recipientCount: parsed.recipients.length, sent: result.sent },
      "Report PDF email",
    );
    if (!result.sent) {
      res.status(502).json({ error: result.error ?? "Failed to send the report email." });
      return;
    }
    res.json({ sent: true, recipients: parsed.recipients });
  } catch (error) {
    sendError(req, res, error, "Failed to email report");
  }
});

router.get("/runs/:runId/data.csv", requireToolAccess("reporting"), async (req, res) => {
  try {
    const runs = await db.select().from(reportRunsTable).where(and(
      eq(reportRunsTable.id, req.params.runId as string),
      eq(reportRunsTable.requestedByUserId, res.locals.dbUser.id),
    )).limit(1);
    const run = runs[0];
    if (!run || run.expiresAt < new Date()) {
      res.status(410).json({ error: "This prepared report expired. Prepare the data again." });
      return;
    }
    const file = await storage.getObjectEntityFile(run.cleanedObjectPath);
    const data = await readFile(file.path);
    const fileName = `${safeFilePart(run.eventName)}-${run.startDate}-to-${run.endDate}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(data);
  } catch (error) {
    sendError(req, res, error, "Failed to download prepared CSV");
  }
});

export default router;
