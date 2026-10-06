import { boolean, date, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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

// One row per Weekly Pulse run (scheduled or "Send test now"), recorded
// whether or not the email itself went out, so the numbers are never lost to
// a mail failure. Backs the "Download latest report" CSV and the long-term
// tracker below.
//
// countsTowardTracker marks the single run per config per standard week that
// the year-over-year tracker should use: the window must end on a Monday at
// 00:00 UTC (what the Monday Cron Trigger produces -- see computeWeekRange in
// routes/weeklyPulse.ts), so a mid-week "Send test now" with an odd window
// never lands in the tracker. A later qualifying run for the same config and
// week (a retry, or a Monday re-send) supersedes the earlier one by flipping
// its flag off rather than deleting it.
//
// configId is ON DELETE SET NULL and configName is a snapshot, so deleting a
// Weekly Pulse config never erases its history.
export const weeklyPulseRunsTable = pgTable("weekly_pulse_runs", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").references(() => weeklyPulseConfigTable.id, { onDelete: "set null" }),
  configName: text("config_name").notNull(),
  trigger: text("trigger").notNull(), // "scheduled" | "manual"
  weekStart: date("week_start").notNull(),
  weekEnd: date("week_end").notNull(), // exclusive, matches the email's window
  countsTowardTracker: boolean("counts_toward_tracker").notNull().default(false),
  emailStatus: text("email_status"), // "sent" | "error" | null while sending
  emailError: text("email_error"),
  ranAt: timestamp("ran_at").notNull().defaultNow(),
}, (table) => [
  index("weekly_pulse_runs_config_id_idx").on(table.configId),
  index("weekly_pulse_runs_week_start_idx").on(table.weekStart),
]);

// The master tracker: one row per number in a run. Query it with
// weekly_pulse_runs.counts_toward_tracker = true for clean week-by-week,
// year-over-year series. sourceType is "checkins" | "group" | "form" |
// "form_field"; for "form_field" rows, detail holds the answer text and
// fieldLabel the question. sourceId is the Planning Center id, so a series
// survives a rename in Planning Center. value is NULL when the number
// couldn't be fetched at all (warning says why) -- never a fake 0.
export const weeklyPulseMetricsTable = pgTable("weekly_pulse_metrics", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => weeklyPulseRunsTable.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  sourceName: text("source_name").notNull(),
  fieldLabel: text("field_label"),
  detail: text("detail"),
  value: integer("value"),
  warning: text("warning"),
}, (table) => [
  index("weekly_pulse_metrics_run_id_idx").on(table.runId),
  index("weekly_pulse_metrics_source_idx").on(table.sourceType, table.sourceId),
]);

export type WeeklyPulseRun = typeof weeklyPulseRunsTable.$inferSelect;
export type WeeklyPulseMetric = typeof weeklyPulseMetricsTable.$inferSelect;

// One-time (re-runnable) history of Check-Ins attendance per event per week,
// pulled read-only from Planning Center by the "Attendance history" tool on
// the Reporting page -- see routes/attendanceHistory.ts. Weeks use the same
// Monday-00:00-UTC boundaries as the Weekly Pulse (computeWeekRange), so a
// row here lines up with the tracker's weekly_pulse_metrics rows for the same
// event (source_type "checkins", source_id = event_id). Re-pulling an event
// overwrites its weeks (unique on event_id + week_start). Weeks where the
// event had no sessions have no row.
export const checkinsWeeklyHistoryTable = pgTable("checkins_weekly_history", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull(),
  eventName: text("event_name").notNull(),
  eventArchived: boolean("event_archived").notNull().default(false),
  weekStart: date("week_start").notNull(),
  weekEnd: date("week_end").notNull(), // exclusive
  uniqueAttendees: integer("unique_attendees").notNull(),
  totalCheckIns: integer("total_check_ins").notNull(),
  sessions: integer("sessions").notNull(), // event periods in the week
  // Unique attendees by Planning Center gender (migration 0037). NULL on
  // rows saved before gender was tracked.
  maleAttendees: integer("male_attendees"),
  femaleAttendees: integer("female_attendees"),
  unknownGenderAttendees: integer("unknown_gender_attendees"),
  // First-time guests whose first check-in was this week, and how many of
  // them have since come back to any later service (migration 0037). Filled
  // in when a report is prepared for the event; NULL otherwise.
  firstTimers: integer("first_timers"),
  firstTimersReturned: integer("first_timers_returned"),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("checkins_weekly_history_event_week_idx").on(table.eventId, table.weekStart),
  index("checkins_weekly_history_week_start_idx").on(table.weekStart),
]);

export type CheckinsWeeklyHistory = typeof checkinsWeeklyHistoryTable.$inferSelect;

// Planning Center Groups attendance history per group per week, pulled
// read-only by the "Group attendance history" tool on the Reporting page --
// see routes/groupHistory.ts. Same Monday-00:00-UTC weeks as
// checkins_weekly_history. Groups only have attendance for meetings where a
// leader took it: `attendees` is NULL for a week whose meetings had no
// attendance recorded (not taken), which is different from 0 (taken, nobody
// came). Re-pulling a group overwrites its weeks.
export const groupsWeeklyHistoryTable = pgTable("groups_weekly_history", {
  id: serial("id").primaryKey(),
  groupId: text("group_id").notNull(),
  groupName: text("group_name").notNull(),
  groupArchived: boolean("group_archived").notNull().default(false),
  weekStart: date("week_start").notNull(),
  weekEnd: date("week_end").notNull(), // exclusive
  meetings: integer("meetings").notNull(), // group events in the week
  attendees: integer("attendees"), // unique people marked present
  attendanceRecords: integer("attendance_records").notNull(), // all records, present or not
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("groups_weekly_history_group_week_idx").on(table.groupId, table.weekStart),
  index("groups_weekly_history_week_start_idx").on(table.weekStart),
]);

export type GroupsWeeklyHistory = typeof groupsWeeklyHistoryTable.$inferSelect;
