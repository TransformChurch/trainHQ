import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { tracksTable } from "./tracks";

export const trackAssignmentsTable = pgTable("track_assignments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  trackId: integer("track_id").notNull().references(() => tracksTable.id, { onDelete: "cascade" }),
  assignedBy: text("assigned_by").notNull(),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
}, (table) => [
  unique("track_assignments_user_track_unique").on(table.userId, table.trackId),
]);

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