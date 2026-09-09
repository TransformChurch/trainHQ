import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { videosTable } from "./videos";

export const watchHistoryTable = pgTable("watch_history", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  videoId: integer("video_id").notNull().references(() => videosTable.id, { onDelete: "cascade" }),
  progressPercent: integer("progress_percent").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  needsReview: boolean("needs_review").notNull().default(false),
  lastWatchedAt: timestamp("last_watched_at").notNull().defaultNow(),
});

export const insertWatchHistorySchema = createInsertSchema(watchHistoryTable).omit({ id: true, lastWatchedAt: true });
export type InsertWatchHistory = z.infer<typeof insertWatchHistorySchema>;
export type WatchHistory = typeof watchHistoryTable.$inferSelect;
