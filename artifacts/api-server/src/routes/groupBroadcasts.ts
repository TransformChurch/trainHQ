// "Group Texting" (and, as of 2026-10-02, email) -- an admin-triggered,
// one-way broadcast sent either to a Planning Center Group's members or to a
// CSV-uploaded list, over SMS (Twilio) or email (Resend, via the same
// lib/email.ts helper weeklyPulse.ts uses). On-demand only: no cron, no
// persistent "config" to enable/disable, just compose a message, resolve
// recipients, send, and log the result for a history list in the admin UI.
//
// Planning Center Groups membership (GET /groups/v2/groups/{id}/memberships)
// is a documented, stable PCO Groups endpoint -- unlike the group *events/
// attendances* endpoint weeklyPulse.ts has to guess at for attendance
// counts, this one is just "who is in this group" and is not a guess.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, groupBroadcastsTable, type GroupBroadcast } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";
import { getValidPlanningCenterAccessToken } from "../lib/planningCenter";
import { sendSms, isSmsConfigured, getEstimatedSmsPrice, countSmsSegments } from "../lib/sms";
import { sendEmail } from "../lib/email";
import {
  PEOPLE_BASE,
  type JsonApiResource,
  planningCenterRequest,
  fetchCollection,
  relationshipId,
  text,
  firstValue,
} from "./reports";

const router: IRouter = Router();

// Same "not confirmed against Planning Center's docs the way Check-Ins was"
// caveat as weeklyPulse.ts's GROUPS_BASE -- duplicated locally rather than
// imported since reports.ts doesn't export it either.
const GROUPS_BASE = "https://api.planningcenteronline.com/groups/v2";

// Paced the same way reports.ts's own PEOPLE_BATCH_SIZE/PEOPLE_BATCH_DELAY_MS
// are -- see that file's 2026-10-01 comment for the rate-limit numbers these
// are tuned against. Duplicated locally rather than imported since those two
// constants aren't exported (only the functions that use them are).
const PEOPLE_BATCH_SIZE = 15;
const PEOPLE_BATCH_DELAY_MS = 2_000;

// Twilio throttles a single sender -- especially a long-code number that
// hasn't completed A2P 10DLC registration -- to roughly 1 message/sec.
// Sending sequentially with this delay between messages is simple and safe;
// revisit once the account's actual registered throughput tier is known.
const SMS_SEND_DELAY_MS = 350;

type Channel = "sms" | "email";

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

type BroadcastRecipientResult = { name: string; contact: string; status: "sent" | "failed" | "skipped"; error?: string };

function parseJsonRecipients(raw: string | null | undefined): BroadcastRecipientResult[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
      .map((value) => ({
        name: text(value.name),
        contact: text(value.contact),
        status: value.status === "sent" || value.status === "failed" || value.status === "skipped" ? value.status : "failed",
        error: typeof value.error === "string" ? value.error : undefined,
      }));
  } catch {
    return [];
  }
}

function toBroadcastJson(row: GroupBroadcast) {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    subject: row.subject,
    message: row.message,
    sourceType: row.sourceType,
    sourceGroupIds: parseJsonArray(row.sourceGroupIds),
    recipientCount: row.recipientCount,
    successCount: row.successCount,
    failureCount: row.failureCount,
    recipients: parseJsonRecipients(row.recipients),
    estimatedCostUsd: row.estimatedCostUsd,
    sentByUserId: row.sentByUserId,
    sentAt: row.sentAt,
  };
}

// US-centric best-effort E.164 normalizer: a bare 10-digit number is assumed
// US/Canada (+1), an 11-digit number starting with 1 gets a +, and anything
// already starting with + is taken as already in E.164 (loosely validated by
// digit count, 8-15 per the ITU E.164 max). Anything else is reported back
// as unparseable rather than guessed at further -- the admin reviews flagged
// numbers before sending (see the dryRun preview in POST /send) rather than
// risk silently mis-dialing a number this couldn't confidently normalize.
export function normalizePhoneToE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (hasPlus) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RawRecipient = { name: string; phone: string | null; email: string | null };
type RecipientPreview = { name: string; contact: string; valid: boolean; reason?: string };

// "contact" is whichever field the chosen channel cares about (phone for
// sms, email for email) -- resolved once here so the rest of the route
// doesn't need to branch on channel again.
function normalizeRawRecipients(raw: RawRecipient[], channel: Channel): RecipientPreview[] {
  return raw.map(({ name, phone, email }) => {
    if (channel === "email") {
      if (!email) return { name, contact: "", valid: false, reason: "No email address on file" };
      const normalized = email.trim().toLowerCase();
      if (!EMAIL_PATTERN.test(normalized)) return { name, contact: email, valid: false, reason: "Could not read this as a valid email address" };
      return { name, contact: normalized, valid: true };
    }
    if (!phone) return { name, contact: "", valid: false, reason: "No phone number on file" };
    const normalized = normalizePhoneToE164(phone);
    if (!normalized) return { name, contact: phone, valid: false, reason: "Could not read this as a valid phone number" };
    return { name, contact: normalized, valid: true };
  });
}

// Collapses duplicate valid contacts (e.g. the same person turning up in two
// selected groups) so nobody gets messaged twice in one broadcast. Invalid
// entries are never deduped against each other -- there's nothing to key
// them on, and the admin should see each one flagged in the preview.
function dedupeByContact(recipients: RecipientPreview[]): RecipientPreview[] {
  const seen = new Set<string>();
  const result: RecipientPreview[] = [];
  for (const recipient of recipients) {
    if (recipient.valid) {
      if (seen.has(recipient.contact)) continue;
      seen.add(recipient.contact);
    }
    result.push(recipient);
  }
  return result;
}

// Exported for testing only (see groupBroadcasts.test.ts) -- not used
// outside this module otherwise.
export async function resolveRecipientsFromGroups(groupIds: string[], accessToken: string): Promise<RawRecipient[]> {
  const personIds = new Set<string>();
  for (const groupId of groupIds) {
    const memberships = await fetchCollection(
      `${GROUPS_BASE}/groups/${encodeURIComponent(groupId)}/memberships?per_page=100`,
      accessToken,
    );
    for (const membership of memberships.data) {
      const personId = relationshipId(membership, "person");
      if (personId) personIds.add(personId);
    }
  }

  const ids = [...personIds];
  const results: RawRecipient[] = [];
  const totalBatches = Math.ceil(ids.length / PEOPLE_BATCH_SIZE);
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    const batch = ids.slice(batchIndex * PEOPLE_BATCH_SIZE, (batchIndex + 1) * PEOPLE_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(async (id): Promise<RawRecipient> => {
      try {
        const page = await planningCenterRequest(`${PEOPLE_BASE}/people/${encodeURIComponent(id)}?include=emails,phone_numbers`, accessToken);
        const attributes = page.data?.attributes ?? {};
        const name = [firstValue(attributes, "first_name"), firstValue(attributes, "last_name")].filter(Boolean).join(" ") || `Person ${id}`;
        const included = Array.isArray(page.included) ? page.included as JsonApiResource[] : [];
        const phones = included
          .filter((item) => item.type === "PhoneNumber")
          .map((item) => ({ number: text(item.attributes?.number), location: text(item.attributes?.location).toLowerCase() }))
          .filter((item) => item.number);
        const mobile = phones.find((phone) => phone.location.includes("mobile") || phone.location.includes("cell"))?.number;
        const emails = included.filter((item) => item.type === "Email").map((item) => text(item.attributes?.address)).filter(Boolean);
        return { name, phone: mobile || phones[0]?.number || null, email: emails[0] || null };
      } catch (error) {
        // Audit finding 1.10: an expired/revoked Planning Center access
        // token (401/403) was being swallowed here along with every other
        // per-person lookup failure, and reported to the admin as "No
        // phone number on file" / "No email address on file" -- actively
        // misleading, and for a broadcast that runs long enough for the
        // token to expire mid-batch, it silently drops every remaining
        // recipient instead of failing clearly. Once the token's bad, every
        // other call in this batch (and every later batch) will fail the
        // same way, so re-throw rather than keep masking it: the route's
        // own try/catch turns this into the same "reconnect Church Center"
        // error GET /sources already surfaces for this exact failure mode.
        // A genuine per-person issue (e.g. a 404 for a deleted person) is
        // the only thing this fallback is meant to cover.
        const status = (error as { status?: number }).status;
        if (status === 401 || status === 403) throw error;
        return { name: `Person ${id}`, phone: null, email: null };
      }
    }));
    results.push(...batchResults);
    if (batchIndex < totalBatches - 1) await new Promise((resolve) => setTimeout(resolve, PEOPLE_BATCH_DELAY_MS));
  }
  return results;
}

router.get("/sources", requireAdmin, async (req, res) => {
  try {
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    let groupsError: string | undefined;
    const groupsCollection = await fetchCollection(`${GROUPS_BASE}/groups?per_page=100`, accessToken).catch((error) => {
      req.log.warn({ err: error }, "Failed to load Planning Center groups for group broadcast picker");
      groupsError = (error as Error & { status?: number }).status === 403
        ? "Reconnect Church Center to grant Groups access (the current connection predates it)."
        : error instanceof Error ? error.message : String(error);
      return { data: [] as JsonApiResource[], included: [] as JsonApiResource[] };
    });
    res.json({
      groups: groupsCollection.data.map((group) => ({
        id: group.id,
        name: firstValue(group.attributes ?? {}, "name") || `Group ${group.id}`,
      })),
      groupsError,
      smsConfigured: isSmsConfigured(),
    });
  } catch (error) {
    sendError(req, res, error, "Failed to load Planning Center groups");
  }
});

router.post("/send", requireAdmin, async (req, res) => {
  try {
    const channel: Channel = req.body?.channel === "email" ? "email" : "sms";
    const message = text(req.body?.message).trim();
    const subject = text(req.body?.subject).trim();
    const sourceType: "pco_group" | "csv" = req.body?.sourceType === "csv" ? "csv" : "pco_group";
    const dryRun = Boolean(req.body?.dryRun);
    // A dry run is purely "who would this go to" -- let the admin preview a
    // group/CSV selection before they've finished writing the message.
    if (!dryRun) {
      if (!message) {
        res.status(400).json({ error: "A message is required." });
        return;
      }
      if (channel === "email" && !subject) {
        res.status(400).json({ error: "A subject line is required for email." });
        return;
      }
    }

    let raw: RawRecipient[];
    let sourceGroupIds: string[] = [];

    if (sourceType === "pco_group") {
      sourceGroupIds = Array.isArray(req.body?.groupIds)
        ? req.body.groupIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
        : [];
      if (!sourceGroupIds.length) {
        res.status(400).json({ error: "Select at least one group." });
        return;
      }
      const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
      raw = await resolveRecipientsFromGroups(sourceGroupIds, accessToken);
    } else {
      const provided = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
      raw = provided
        .filter((value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null)
        .map((value: Record<string, unknown>) => ({
          name: text(value.name) || text(value.phone) || text(value.email),
          phone: text(value.phone) || null,
          email: text(value.email) || null,
        }));
      if (!raw.length) {
        res.status(400).json({ error: "No recipients were provided." });
        return;
      }
    }

    const resolved = dedupeByContact(normalizeRawRecipients(raw, channel));
    const validRecipients = resolved.filter((recipient) => recipient.valid);

    if (dryRun) {
      let cost: { segments: number; pricePerSegment: number; currency: string; estimatedTotal: number } | null = null;
      if (channel === "sms" && message) {
        const price = await getEstimatedSmsPrice();
        if (price) {
          const segments = countSmsSegments(message);
          cost = {
            segments,
            pricePerSegment: price.pricePerSegment,
            currency: price.currency,
            estimatedTotal: Number((segments * validRecipients.length * price.pricePerSegment).toFixed(4)),
          };
        }
      }
      res.json({
        recipientCount: resolved.length,
        validCount: validRecipients.length,
        invalidCount: resolved.length - validRecipients.length,
        recipients: resolved,
        cost,
      });
      return;
    }

    if (!validRecipients.length) {
      res.status(400).json({ error: `None of the resolved recipients had a usable ${channel === "sms" ? "phone number" : "email address"}.` });
      return;
    }
    if (channel === "sms" && !isSmsConfigured()) {
      res.status(409).json({
        error: "Twilio is not configured yet -- set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and a sender (TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER) as Worker secrets first.",
      });
      return;
    }

    const results: BroadcastRecipientResult[] = resolved
      .filter((recipient) => !recipient.valid)
      .map((recipient) => ({ name: recipient.name, contact: recipient.contact, status: "skipped", error: recipient.reason }));

    let estimatedCostUsd: string | null = null;
    if (channel === "sms") {
      const price = await getEstimatedSmsPrice();
      if (price) {
        const segments = countSmsSegments(message);
        estimatedCostUsd = (segments * validRecipients.length * price.pricePerSegment).toFixed(4);
      }
      // Sequential, not parallel: see SMS_SEND_DELAY_MS's comment above.
      for (const recipient of validRecipients) {
        const outcome = await sendSms({ to: recipient.contact, body: message });
        results.push({ name: recipient.name, contact: recipient.contact, status: outcome.sent ? "sent" : "failed", error: outcome.error });
        await new Promise((resolve) => setTimeout(resolve, SMS_SEND_DELAY_MS));
      }
    } else {
      // Resend accepts an array of "to" addresses in one call -- no per-
      // recipient pacing concern the way Twilio has, and no per-message
      // cost worth estimating.
      const outcome = await sendEmail({ to: validRecipients.map((recipient) => recipient.contact), subject, html: message.replace(/\n/g, "<br>") });
      for (const recipient of validRecipients) {
        results.push({ name: recipient.name, contact: recipient.contact, status: outcome.sent ? "sent" : "failed", error: outcome.error });
      }
    }

    const successCount = results.filter((result) => result.status === "sent").length;
    const failureCount = results.filter((result) => result.status === "failed").length;

    const [row] = await db.insert(groupBroadcastsTable).values({
      name: text(req.body?.name),
      channel,
      subject: channel === "email" ? subject : null,
      message,
      sourceType,
      sourceGroupIds: JSON.stringify(sourceGroupIds),
      recipientCount: results.length,
      successCount,
      failureCount,
      recipients: JSON.stringify(results),
      estimatedCostUsd,
      sentByUserId: res.locals.dbUser.id,
    }).returning();

    res.json(toBroadcastJson(row));
  } catch (error) {
    sendError(req, res, error, "Failed to send group broadcast");
  }
});

router.get("/history", requireAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(groupBroadcastsTable).orderBy(desc(groupBroadcastsTable.sentAt)).limit(50);
    res.json(rows.map(toBroadcastJson));
  } catch (error) {
    sendError(req, res, error, "Failed to load group broadcast history");
  }
});

export default router;
