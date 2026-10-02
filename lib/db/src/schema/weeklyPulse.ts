import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Config for the automated "weekly pulse" email -- a lightweight, numbers-only
// attendance summary (Check-Ins events + Groups + a Planning Center Form),
// sent automatically every Monday morning by the Worker's Cron Trigger (see
// src/worker.ts's scheduled() handler and routes/weeklyPulse.ts's
// POST /api/weekly-pulse/run-scheduled). Unlike reportTemplatesTable (the
// Kids/Youth PDF decks, run on demand from the Reporting tab), this is a
// single automated job per row -- no "prepare" step, no cleanup script, no
// chart rendering.
//
// checkinsEventIds / groupIds / recipientEmails / pcoForms are stored as
// JSON-encoded text, matching reportTemplatesTable.pullFields' existing
// convention for a variable-length list in a single column rather than a
// join table -- consistent with how that neighboring table already does it.
export const weeklyPulseConfigTable = pgTable("weekly_pulse_config", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("Weekly Attendance Pulse"),
  enabled: boolean("enabled").notNull().default(true),
  recipientEmails: text("recipient_emails").notNull(),
  checkinsEventIds: text("checkins_event_ids").notNull().default("[]"),
  groupIds: text("group_ids").notNull().default("[]"),
  // JSON array of { formId: string, fieldId: string | null } -- a config can
  // pull from any number of forms (2026-10-02: originally a single optional
  // pcoFormId/pcoFormFieldId pair, widened to a list per request). fieldId is
  // per-entry and optional even when a form is set (falls back to a plain
  // submission count for that form -- see routes/weeklyPulse.ts).
  pcoForms: text("pco_forms").notNull().default("[]"),
  createdByUserId: text("created_by_user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // Visibility into the automated run, surfaced in the admin UI, since
  // nobody is watching a terminal when this fires at 6am Monday.
  lastRunAt: timestamp("last_run_at"),
  lastRunStatus: text("last_run_status"), // "success" | "error"
  lastRunError: text("last_run_error"),
});

export type WeeklyPulseConfig = typeof weeklyPulseConfigTable.$inferSelect;
