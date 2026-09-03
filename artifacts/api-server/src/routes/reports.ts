import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import {
  db,
  reportRunsTable,
  reportTemplatesTable,
} from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import { requireAdmin, requireManagerOrAdmin } from "../middlewares/requireAuth";
import { getValidPlanningCenterAccessToken } from "../lib/planningCenter";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const CHECK_INS_BASE = "https://api.planningcenteronline.com/check-ins/v2";
const PEOPLE_BASE = "https://api.planningcenteronline.com/people/v2";
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const REPORT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SESSION_COUNT = 5;
const MAX_SESSION_COUNT = 52;
type CleanupMode = "month_quarter" | "all_dates";
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

type JsonApiResource = {
  id: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string; type?: string } | null }>;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function csv(value: unknown): string {
  const raw = String(value ?? "");
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function dateOnly(value: unknown): string {
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

async function planningCenterRequest(url: string, accessToken: string): Promise<any> {
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

async function fetchCollection(
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

function relationshipId(resource: JsonApiResource, name: string): string {
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

function firstValue(attributes: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = text(attributes[name]);
    if (value) return value;
  }
  return "";
}

function reportText(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map(reportText).filter(Boolean).join(", ");
  return text(value);
}

function firstReportValue(attributes: Record<string, unknown>, ...names: string[]): string {
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
): Promise<Map<string, Record<string, unknown>>> {
  const result = new Map<string, Record<string, unknown>>();
  const failedIds: string[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
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
          continue;
        }
        result.set(id, attributes);
      } catch {
        failedIds.push(id);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, () => worker()));
  if (failedIds.length) {
    const error = new Error(
      `Planning Center profile details could not be loaded for ${failedIds.length} ${failedIds.length === 1 ? "person" : "people"}. Please prepare the report again.`,
    ) as Error & { status?: number };
    error.status = 503;
    throw error;
  }
  return result;
}

function pythonScript(name: CleanupMode | "template"): string {
  const fileName = name === "month_quarter"
    ? "cleanup_attendance_month_quarter.py"
    : name === "all_dates"
      ? "cleanup_attendance_all_dates.py"
      : "paste_to_template.py";
  const sourceFileName = name === "month_quarter"
    ? "cleanup_attendance_MonthQuarter_1788469555267.py"
    : name === "all_dates"
      ? "cleanup_attendance_AllDates_1788469555268.py"
      : "paste_to_template_1788451691917.py";
  const built = join(dirname(fileURLToPath(import.meta.url)), fileName);
  const source = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../..",
    "attached_assets",
    sourceFileName,
  );
  return process.env.NODE_ENV === "production" ? built : source;
}

async function runPython(args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", args, { env: process.env });
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

router.get("/events", requireManagerOrAdmin, async (req, res) => {
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

router.get("/fields", requireAdmin, async (req, res) => {
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

router.get("/templates", requireManagerOrAdmin, async (_req, res) => {
  const rows = await db.select().from(reportTemplatesTable).orderBy(reportTemplatesTable.name);
  res.json(rows.map(({ objectPath: _objectPath, pullFields, ...row }) => ({
    ...row,
    pullFields: normalizePullFields(pullFields),
  })));
});

router.post("/templates", requireAdmin, async (req, res) => {
  try {
    const name = text(req.body?.name);
    const originalFileName = basename(text(req.body?.originalFileName));
    const objectPath = text(req.body?.objectPath);
    if (!name || !originalFileName.toLowerCase().endsWith(".xlsx") || !objectPath.startsWith("/objects/")) {
      res.status(400).json({ error: "Name, uploaded XLSX file, and object path are required." });
      return;
    }
    await storage.getObjectEntityFile(objectPath);
    const rows = await db.insert(reportTemplatesTable).values({
      name,
      originalFileName,
      objectPath,
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
    await storage.deleteObjectEntity(rows[0].objectPath).catch(() => undefined);
    res.status(204).end();
  } catch (error) {
    sendError(req, res, error, "Failed to delete report template");
  }
});

router.post("/prepare", requireManagerOrAdmin, async (req, res) => {
  let workDir = "";
  try {
    await cleanExpiredRuns();
    const eventId = text(req.body?.eventId);
    const requestedStartDate = dateOnly(req.body?.startDate);
    const endDate = dateOnly(req.body?.endDate);
    const templateId = Number(req.body?.templateId);
    if (!eventId || !endDate || !Number.isInteger(templateId)) {
      res.status(400).json({ error: "Select an event, template, and valid end date." });
      return;
    }

    const templates = await db.select().from(reportTemplatesTable)
      .where(eq(reportTemplatesTable.id, templateId))
      .limit(1);
    const template = templates[0];
    if (!template) {
      res.status(404).json({ error: "Report template not found." });
      return;
    }
    const pullFields = normalizePullFields(template.pullFields);
    const sessionCount = normalizeSessionCount(template.sessionCount);
    const cleanupMode = normalizeCleanupMode(template.cleanupMode);
    if (cleanupMode === "all_dates" && (!requestedStartDate || requestedStartDate > endDate)) {
      res.status(400).json({ error: "Select a valid start and end date for an All Dates template." });
      return;
    }
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    const customFieldDefinitions = await fetchReportFieldDefinitions(accessToken);
    const customLabels = new Map(customFieldDefinitions.map((field) => [field.key, field.label]));
    const selectedCustomFields = pullFields.filter(isCustomFieldKey);
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
    const eligibleSessions = periodCollection.data
      .map((period) => ({
        id: period.id,
        date: dateOnly(period.attributes?.starts_at),
      }))
      .filter((period) =>
        period.id
        && period.date
        && period.date <= endDate
        && (cleanupMode !== "all_dates" || period.date >= requestedStartDate),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    const sessions = cleanupMode === "all_dates"
      ? eligibleSessions.reverse()
      : eligibleSessions.slice(0, sessionCount).reverse();
    if (!sessions.length) {
      res.status(404).json({
        error: cleanupMode === "all_dates"
          ? "No Planning Center sessions were found in that date range."
          : "No Planning Center sessions were found on or before that end date.",
      });
      return;
    }
    const selectedSessionIds = new Set(sessions.map((session) => session.id));
    const sessionDateById = new Map(sessions.map((session) => [session.id, session.date]));
    const firstTimeIds = new Set(firstTimeCollection.data.map((checkIn) => checkIn.id));
    const inRange = collection.data.filter((checkIn) =>
      selectedSessionIds.has(relationshipId(checkIn, "event_period")),
    );
    if (!inRange.length) {
      res.status(404).json({ error: "No attendee check-ins were found in the selected sessions." });
      return;
    }

    const includedPeople = new Map(
      collection.included.filter((resource) => resource.id).map((resource) => [resource.id, resource.attributes ?? {}]),
    );
    const personIds = [...new Set(inRange.map((checkIn) => relationshipId(checkIn, "person")).filter(Boolean))];
    const peopleDetails = await fetchPeopleDetails(personIds, accessToken);
    const serviceDates = sessions.map((session) => session.date);
    const startDate = cleanupMode === "all_dates" ? requestedStartDate : serviceDates[0];
    const records = new Map<string, Record<string, string | boolean>>();

    for (const checkIn of inRange) {
      const attrs = checkIn.attributes ?? {};
      const personId = relationshipId(checkIn, "person");
      const person = { ...(includedPeople.get(personId) ?? {}), ...(peopleDetails.get(personId) ?? {}) };
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
      const firstTimer = firstTimeIds.has(checkIn.id) || attrs.first_time === true || attrs.first_time_in_event === true;
      if (firstTimer) current["First Timers"] = "First-timer";
      const sessionDate = sessionDateById.get(relationshipId(checkIn, "event_period"));
      if (sessionDate) current[sessionDate] = true;
      records.set(key, current);
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
    const output = await runPython([pythonScript(cleanupMode), rawPath, cleanedPath, "--flags-out", flagsPath]);
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
      requestedByUserId: res.locals.dbUser.id,
      expiresAt,
    });
    const reviewCount = Number(output.match(/ENTRIES NEEDING YOUR REVIEW:\s*(\d+)/)?.[1] ?? 0);
    res.json({
      runId,
      eventName,
      rawRows: inRange.length,
      peopleCount: records.size,
      serviceDates,
      sessionCount: sessions.length,
      pullFields,
      pullFieldLabels: pullFields.map((field) => fieldLabel(field, customLabels)),
      reviewCount,
      flags,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    sendError(req, res, error, "Failed to prepare report data");
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

router.post("/generate", requireManagerOrAdmin, async (req, res) => {
  let workDir = "";
  try {
    const runId = text(req.body?.runId);
    const templateId = Number(req.body?.templateId);
    const format = text(req.body?.format).toLowerCase();
    if (!runId || !Number.isInteger(templateId) || !["xlsx", "pdf"].includes(format)) {
      res.status(400).json({ error: "Report run, template, and output format are required." });
      return;
    }
    const runs = await db.select().from(reportRunsTable).where(and(
      eq(reportRunsTable.id, runId),
      eq(reportRunsTable.requestedByUserId, res.locals.dbUser.id),
    )).limit(1);
    const templates = await db.select().from(reportTemplatesTable).where(eq(reportTemplatesTable.id, templateId)).limit(1);
    const run = runs[0];
    const template = templates[0];
    if (!run || run.expiresAt < new Date()) {
      res.status(410).json({ error: "This prepared report expired. Prepare the data again." });
      return;
    }
    if (!template) {
      res.status(404).json({ error: "Report template not found." });
      return;
    }
    if (run.templateId !== templateId) {
      res.status(409).json({ error: "This report was prepared for a different template. Prepare the data again." });
      return;
    }

    workDir = await mkdtemp(join(tmpdir(), "tc-report-output-"));
    const templateFile = await storage.getObjectEntityFile(template.objectPath);
    const cleanedFile = await storage.getObjectEntityFile(run.cleanedObjectPath);
    const templatePath = join(workDir, "template.xlsx");
    const cleanedPath = join(workDir, "cleaned.csv");
    const xlsxPath = join(workDir, "report.xlsx");
    const pdfPath = join(workDir, "report.pdf");
    await writeFile(templatePath, await readFile(templateFile.path));
    await writeFile(cleanedPath, await readFile(cleanedFile.path));
    const args = [
      pythonScript("template"),
      "--template", templatePath,
      "--data", cleanedPath,
      "--out-xlsx", xlsxPath,
      "--work-dir", join(workDir, "work"),
    ];
    if (format === "pdf") args.push("--out-pdf", pdfPath);
    await runPython(args, format === "pdf" ? 180_000 : 90_000);
    const outputPath = format === "pdf" ? pdfPath : xlsxPath;
    const result = await readFile(outputPath);
    const fileName = `${safeFilePart(run.eventName)}-${run.startDate}-to-${run.endDate}.${format}`;
    res.setHeader("Content-Type", format === "pdf" ? "application/pdf" : XLSX_TYPE);
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(result);
  } catch (error) {
    sendError(req, res, error, "Failed to generate report");
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

router.get("/runs/:runId/data.csv", requireManagerOrAdmin, async (req, res) => {
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