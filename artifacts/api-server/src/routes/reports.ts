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

async function planningCenterRequest(url: string, accessToken: string): Promise<any> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "Transform Church Reporting",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    const permission = response.status === 401 || response.status === 403;
    const error = new Error(
      permission
        ? "Planning Center Check-Ins access is missing. Reconnect Church Center and approve Check-Ins access."
        : `Planning Center request failed (${response.status}).`,
    ) as Error & { status?: number; details?: string };
    error.status = permission ? 403 : 502;
    error.details = body.slice(0, 1000);
    throw error;
  }
  return response.json();
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

function ageFrom(attributes: Record<string, unknown>): string {
  const explicit = attributes.age;
  if (typeof explicit === "number" && Number.isFinite(explicit)) return String(Math.floor(explicit));
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const birthdate = dateOnly(attributes.birthdate);
  if (!birthdate) return "";
  const born = new Date(`${birthdate}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return "";
  const today = new Date();
  let age = today.getUTCFullYear() - born.getUTCFullYear();
  if (
    today.getUTCMonth() < born.getUTCMonth() ||
    (today.getUTCMonth() === born.getUTCMonth() && today.getUTCDate() < born.getUTCDate())
  ) age -= 1;
  return age >= 0 ? String(age) : "";
}

function normalizeGrade(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  const normalized = raw.toLowerCase().replace(/\s+/g, " ");
  if (["k", "kg", "kindergarten"].includes(normalized)) return "Kindergarten";
  if (["pre-k", "prek", "pre k"].includes(normalized)) return "Pre-K";
  const gradeNumber = normalized.match(/\d{1,2}/)?.[0];
  if (!gradeNumber) return raw;
  const n = Number(gradeNumber);
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

async function fetchPeopleDetails(
  ids: string[],
  accessToken: string,
): Promise<Map<string, Record<string, unknown>>> {
  const result = new Map<string, Record<string, unknown>>();
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
        const phones = included.filter((item) => item.type === "PhoneNumber").map((item) => text(item.attributes?.number)).filter(Boolean);
        if (emails[0]) attributes.email = emails[0];
        if (phones[0]) attributes.phone_number = phones[0];
        result.set(id, attributes);
      } catch {
        result.set(id, {});
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, ids.length) }, () => worker()));
  return result;
}

function pythonScript(name: "cleanup" | "template"): string {
  const built = join(dirname(fileURLToPath(import.meta.url)), name === "cleanup" ? "cleanup_attendance.py" : "paste_to_template.py");
  const source = join(
    process.cwd(),
    "attached_assets",
    name === "cleanup" ? "cleanup_attendance_1788449493804.py" : "paste_to_template_1788451691917.py",
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

router.get("/templates", requireManagerOrAdmin, async (_req, res) => {
  const rows = await db.select().from(reportTemplatesTable).orderBy(reportTemplatesTable.name);
  res.json(rows.map(({ objectPath: _objectPath, ...row }) => row));
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
      uploadedByUserId: res.locals.dbUser.id,
    }).returning();
    res.status(201).json({ ...rows[0], objectPath: undefined });
  } catch (error) {
    sendError(req, res, error, "Failed to save report template");
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
    const startDate = dateOnly(req.body?.startDate);
    const endDate = dateOnly(req.body?.endDate);
    if (!eventId || !startDate || !endDate || startDate > endDate) {
      res.status(400).json({ error: "Select an event and a valid date range." });
      return;
    }
    const rangeDays = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000;
    if (!Number.isFinite(rangeDays) || rangeDays > 366) {
      res.status(400).json({ error: "Date ranges must be 366 days or shorter." });
      return;
    }

    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    const eventPage = await planningCenterRequest(`${CHECK_INS_BASE}/events/${encodeURIComponent(eventId)}`, accessToken);
    const eventName = firstValue(eventPage.data?.attributes ?? {}, "name") || `Event ${eventId}`;
    const [collection, firstTimeCollection] = await Promise.all([
      fetchCollection(
        `${CHECK_INS_BASE}/events/${encodeURIComponent(eventId)}/check_ins?filter=attendee&include=person&per_page=100`,
        accessToken,
      ),
      fetchCollection(
        `${CHECK_INS_BASE}/events/${encodeURIComponent(eventId)}/check_ins?filter=first_time&per_page=100`,
        accessToken,
      ),
    ]);
    const firstTimeIds = new Set(firstTimeCollection.data.map((checkIn) => checkIn.id));
    const inRange = collection.data.filter((checkIn) => {
      const date = dateOnly(checkIn.attributes?.created_at);
      return date && date >= startDate && date <= endDate;
    });
    if (!inRange.length) {
      res.status(404).json({ error: "No attendee check-ins were found in that date range." });
      return;
    }

    const includedPeople = new Map(
      collection.included.filter((resource) => resource.id).map((resource) => [resource.id, resource.attributes ?? {}]),
    );
    const personIds = [...new Set(inRange.map((checkIn) => relationshipId(checkIn, "person")).filter(Boolean))];
    const peopleDetails = await fetchPeopleDetails(personIds, accessToken);
    const serviceDates = [...new Set(inRange.map((checkIn) => dateOnly(checkIn.attributes?.created_at)).filter(Boolean))].sort();
    const records = new Map<string, Record<string, string | boolean>>();

    for (const checkIn of inRange) {
      const attrs = checkIn.attributes ?? {};
      const personId = relationshipId(checkIn, "person");
      const person = { ...(includedPeople.get(personId) ?? {}), ...(peopleDetails.get(personId) ?? {}) };
      const firstName = firstValue(attrs, "first_name") || firstValue(person, "first_name", "given_name");
      const lastName = firstValue(attrs, "last_name") || firstValue(person, "last_name", "family_name");
      const key = personId || `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
      const current = records.get(key) ?? {
        "First Name": firstName,
        "Last Name": lastName,
        "Age": ageFrom(person),
        "Email": firstValue(person, "email", "primary_email"),
        "Phone Number (home)": "",
        "Phone Number (mobile)": firstValue(person, "phone_number", "primary_phone_number", "mobile_phone_number"),
        "Gender": firstValue(person, "gender"),
        "Grade": normalizeGrade(person.grade),
        "First Timers": "",
      };
      const firstTimer = firstTimeIds.has(checkIn.id) || attrs.first_time === true || attrs.first_time_in_event === true;
      if (firstTimer) current["First Timers"] = "First-timer";
      current[dateOnly(attrs.created_at)] = true;
      records.set(key, current);
    }

    const headers = [
      "First Name", "Last Name", "Age", "Email", "Phone Number (home)",
      "Phone Number (mobile)", "Gender", "Grade", "First Timers", ...serviceDates,
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
    const output = await runPython([pythonScript("cleanup"), rawPath, cleanedPath, "--flags-out", flagsPath]);
    const cleaned = await readFile(cleanedPath);
    const flags = await readFile(flagsPath, "utf8").catch(() => "");
    const cleanedObjectPath = await storage.saveObjectEntityBuffer(cleaned, "text/csv", "reports");
    const runId = randomUUID();
    const expiresAt = new Date(Date.now() + REPORT_TTL_MS);
    await db.insert(reportRunsTable).values({
      id: runId,
      eventId,
      eventName,
      startDate,
      endDate,
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

export default router;