import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { modulesTable } from "./modules";

export const enrollmentStatusEnum = pgEnum("enrollment_status", ["active", "completed"]);

export const growthTracksTable = pgTable("growth_tracks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const growthTrackStepsTable = pgTable("growth_track_steps", {
  id: serial("id").primaryKey(),
  growthTrackId: integer("growth_track_id").notNull().references(() => growthTracksTable.id, { onDelete: "cascade" }),
  moduleId: integer("module_id").notNull().references(() => modulesTable.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
});

export const growthTrackEnrollmentsTable = pgTable("growth_track_enrollments", {
  id: serial("id").primaryKey(),
  growthTrackId: integer("growth_track_id").notNull().references(() => growthTracksTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  enrolledBy: text("enrolled_by").notNull(),
  currentStepOrder: integer("current_step_order").notNull().default(1),
  status: enrollmentStatusEnum("status").notNull().default("active"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});
