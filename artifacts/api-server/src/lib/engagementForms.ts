// Planning Center form submissions for the engagement score's Form / Thrive
// part (Andrew, 2026-11-10: "any form submission" counts; admins can exclude
// forms such as staff reports in Tool Management > Engagement).
//
// Runs inside the Monday engagement sync (lib/engagementSync.ts). Read-only:
// GET /people/v2/forms and /forms/{id}/form_submissions?include=person.
// The first run reads every submission; later runs only ones created since
// the previous sync. Stored per form + person: latest submission time and a
// count. Answers are never read or stored.
import { db, engagementFormSubmissionsTable, settingsTable } from "@workspace/db";
import { eq, inArray, notInArray, and, sql } from "drizzle-orm";
import { PEOPLE_BASE, planningCenterRequest, relationshipId, text, type JsonApiResource } from "../routes/reports";

const STATE_KEY = "engagement_forms_state";
const CHUNK = 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type FormInfo = { id: string; name: string; archived: boolean; submissionCount: number };
export type FormsState = { lastSyncedAt: string | null; forms: FormInfo[] };

export async function readFormsState(): Promise<FormsState> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, STATE_KEY)).limit(1);
  try {
    const parsed = rows[0] ? JSON.parse(rows[0].value) : {};
    return { lastSyncedAt: typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : null, forms: Array.isArray(parsed.forms) ? parsed.forms : [] };
  } catch {
    return { lastSyncedAt: null, forms: [] };
  }
}

async function writeFormsState(state: FormsState): Promise<void> {
  const value = JSON.stringify(state);
  await db.insert(settingsTable).values({ key: STATE_KEY, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

async function pages(url: string, accessToken: string, delayMs: number): Promise<JsonApiResource[]> {
  const data: JsonApiResource[] = [];
  let next: string | null = url;
  const visited = new Set<string>();
  while (next && !visited.has(next)) {
    visited.add(next);
    if (delayMs) await sleep(delayMs);
    const page = await planningCenterRequest(next, accessToken);
    data.push(...(Array.isArray(page.data) ? page.data : []));
    next = typeof page.links?.next === "string" && page.links.next ? page.links.next : null;
  }
  return data;
}

// Per form + person: latest submission and how many, from raw submissions
// (only those created after `after`, when given). Pure; unit-tested.
export function tallySubmissions(
  submissions: { personId: string; createdAt: string }[],
  after: string | null,
): Map<string, { lastSubmittedAt: string; submissions: number }> {
  const tally = new Map<string, { lastSubmittedAt: string; submissions: number }>();
  const afterMs = after ? Date.parse(after) : null;
  for (const submission of submissions) {
    const createdMs = Date.parse(submission.createdAt);
    if (!submission.personId || !Number.isFinite(createdMs)) continue;
    // Compare as times: "...00Z" and "...00.000Z" are the same moment.
    if (afterMs !== null && createdMs <= afterMs) continue;
    const current = tally.get(submission.personId);
    tally.set(submission.personId, {
      lastSubmittedAt: !current || createdMs > Date.parse(current.lastSubmittedAt) ? submission.createdAt : current.lastSubmittedAt,
      submissions: (current?.submissions ?? 0) + 1,
    });
  }
  return tally;
}

export async function syncFormSubmissions(accessToken: string, delayMs: number, now: Date = new Date()): Promise<{ forms: number; newSubmissions: number }> {
  const state = await readFormsState();
  const since = state.lastSyncedAt;
  const formRows = await pages(`${PEOPLE_BASE}/forms?per_page=100`, accessToken, delayMs);
  const forms: FormInfo[] = formRows.filter((form) => form.id).map((form) => ({
    id: String(form.id),
    name: text(form.attributes?.name).trim() || `Form ${form.id}`,
    archived: !!form.attributes?.archived_at || !!form.attributes?.deleted_at,
    submissionCount: Number(form.attributes?.submission_count) || 0,
  }));
  let newSubmissions = 0;
  for (const form of forms) {
    if (!form.submissionCount) continue;
    const filter = since ? `&where[created_at][gte]=${encodeURIComponent(since.slice(0, 10))}` : "";
    const rows = await pages(
      `${PEOPLE_BASE}/forms/${encodeURIComponent(form.id)}/form_submissions?per_page=100${filter}`,
      accessToken,
      delayMs,
    );
    const tally = tallySubmissions(
      rows.map((row) => ({ personId: relationshipId(row, "person"), createdAt: text(row.attributes?.created_at) })),
      since,
    );
    const values = [...tally.entries()].map(([personId, value]) => ({
      formId: form.id,
      personId,
      lastSubmittedAt: new Date(value.lastSubmittedAt),
      submissions: value.submissions,
    }));
    for (let index = 0; index < values.length; index += 500) {
      await db.insert(engagementFormSubmissionsTable).values(values.slice(index, index + 500)).onConflictDoUpdate({
        target: [engagementFormSubmissionsTable.formId, engagementFormSubmissionsTable.personId],
        set: {
          lastSubmittedAt: sql`greatest(${engagementFormSubmissionsTable.lastSubmittedAt}, excluded.last_submitted_at)`,
          submissions: sql`${engagementFormSubmissionsTable.submissions} + excluded.submissions`,
        },
      });
    }
    newSubmissions += values.reduce((sum, value) => sum + value.submissions, 0);
  }
  await writeFormsState({ lastSyncedAt: now.toISOString(), forms: forms.sort((a, b) => a.name.localeCompare(b.name)) });
  return { forms: forms.length, newSubmissions };
}

// The people (of `personIds`) with a submission to any form not excluded.
export async function loadFormSubmitters(personIds: string[], excludedFormIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(personIds.filter(Boolean))];
  const result = new Set<string>();
  for (let index = 0; index < ids.length; index += CHUNK) {
    const chunk = ids.slice(index, index + CHUNK);
    const rows = await db.selectDistinct({ personId: engagementFormSubmissionsTable.personId })
      .from(engagementFormSubmissionsTable)
      .where(excludedFormIds.length
        ? and(inArray(engagementFormSubmissionsTable.personId, chunk), notInArray(engagementFormSubmissionsTable.formId, excludedFormIds))
        : inArray(engagementFormSubmissionsTable.personId, chunk));
    for (const row of rows) result.add(row.personId);
  }
  return result;
}
