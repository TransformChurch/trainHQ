import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { tracksTable } from "./tracks";

// Records that a Track (i.e. all of its modules) was assigned to a user, so we have a
// clean "assigned date" to sync to Planning Center — distinct from the per-module
// `assignments` rows, which a Track assignment creates one of per module.
export const trackAssignmentsTable = pgTable("track_assignments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  trackId: integer("track_id").notNull().references(() => tracksTable.id, { onDelete: "cascade" }),
  assignedBy: text("assigned_by").notNull(),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
}, (table) => [
  unique("track_assignments_user_track_unique").on(table.userId, table.trackId),
]);

// Records the first time a user completes every module currently in a Track, so the
// Planning Center "completed date" sync only ever fires once per user per track.
export const trackCompletionsTable = pgTable("track_completions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  trackId: integer("track_id").notNull().references(() => tracksTable.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
}, (table) => [
  unique("track_completions_user_track_unique").on(table.userId, table.trackId),
]);

export type TrackAssignment = typeof trackAssignmentsTable.$inferSelect;
export type TrackCompletion = typeof trackCompletionsTable.$inferSelect;
