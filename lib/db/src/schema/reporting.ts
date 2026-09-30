import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const reportTemplatesTable = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Legacy columns from the removed upload-your-own-xlsx-template +
  // LibreOffice pipeline. Always null for templates created now -- every
  // template requires a built-in `engine` (see below). Kept (rather than
  // dropped) only so old rows/migrations don't need a destructive change.
  originalFileName: text("original_file_name"),
  objectPath: text("object_path"),
  // One of the four built-in pure-Python report renderers (report_youth.py /
  // report_kids.py, bundled with the API server). Required for every
  // template now that the legacy xlsx-upload path has been removed.
  engine: text("engine"),
  pullFields: text("pull_fields").notNull(),
  sessionCount: integer("session_count").notNull().default(5),
  cleanupMode: text("cleanup_mode").notNull().default("month_quarter"),
  uploadedByUserId: text("uploaded_by_user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reportRunsTable = pgTable("report_runs", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  eventName: text("event_name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  templateId: integer("template_id").references(() => reportTemplatesTable.id, { onDelete: "set null" }),
  cleanedObjectPath: text("cleaned_object_path").notNull(),
  requestedByUserId: text("requested_by_user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const reportScriptsTable = pgTable("report_scripts", {
  slot: text("slot").primaryKey(),
  originalFileName: text("original_file_name").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedByUserId: text("uploaded_by_user_id").notNull().references(() => usersTable.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ReportTemplate = typeof reportTemplatesTable.$inferSelect;
export type ReportRun = typeof reportRunsTable.$inferSelect;
export type ReportScript = typeof reportScriptsTable.$inferSelect;