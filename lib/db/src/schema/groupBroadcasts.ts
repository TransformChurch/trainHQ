import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// "Group Texting" / email broadcast -- a one-off, admin-triggered message
// (via Twilio SMS or, as of 2026-10-02, Resend email) sent to either a
// Planning Center Group's members or a CSV-uploaded list. Unlike
// weeklyPulseConfigTable this is NOT a recurring config: there's nothing to
// "enable" or run on a schedule, just a compose-and-send action, logged here
// afterward for a record of what went out and whether it landed. See
// routes/groupBroadcasts.ts.
//
// This table started life as "sms_broadcasts" (migration 0032) before the
// email option was added; migration 0033 renamed it and added channel/
// subject/estimatedCostUsd rather than a drop-and-recreate, since the table
// already existed on the live database (empty, but renaming in place avoids
// relying on DROP TABLE, which has been flaky against this Supabase project
// -- see that migration's comment).
//
// sourceGroupIds / recipients follow the same JSON-text-column convention as
// weeklyPulseConfigTable's checkinsEventIds/groupIds/pcoForms -- a
// variable-length list in one column rather than a join table, consistent
// with how this codebase already does it.
export const groupBroadcastsTable = pgTable("group_broadcasts", {
  id: serial("id").primaryKey(),
  // Optional free-text label for the admin's own reference in the history
  // list (e.g. "Youth Group -- Wed night reminder"). Falls back to a
  // truncated preview of the message body in the UI when blank.
  name: text("name").notNull().default(""),
  // "sms" | "email"
  channel: text("channel").notNull().default("sms"),
  // Email only -- null for sms, since there's no equivalent concept for a text.
  subject: text("subject"),
  message: text("message").notNull(),
  // "pco_group" | "csv"
  sourceType: text("source_type").notNull(),
  // JSON array of Planning Center Group ids selected for this send -- empty
  // when sourceType is "csv".
  sourceGroupIds: text("source_group_ids").notNull().default("[]"),
  recipientCount: integer("recipient_count").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  // JSON array of { name: string, contact: string, status: "sent" | "failed"
  // | "skipped", error?: string } -- one entry per resolved recipient,
  // including ones skipped for an unparseable phone/email. "contact" is a
  // phone number (E.164) for sms or an email address for email -- kept
  // inline (rather than a child table) since a single send tops out at a
  // few hundred rows for a church-sized group/list and nothing here needs
  // to be queried independently of its parent broadcast.
  recipients: text("recipients").notNull().default("[]"),
  // A ballpark pre-send estimate from Twilio's Pricing API, stored as text
  // (not numeric) to avoid float-precision noise -- e.g. "0.47". Null for
  // email (Resend has no comparable per-message cost worth estimating) and
  // null for an sms send made when the estimate wasn't available.
  estimatedCostUsd: text("estimated_cost_usd"),
  sentByUserId: text("sent_by_user_id").notNull().references(() => usersTable.id),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export type GroupBroadcast = typeof groupBroadcastsTable.$inferSelect;
