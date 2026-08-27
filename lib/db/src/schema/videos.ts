import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { modulesTable } from "./modules";

export const videosTable = pgTable("videos", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => modulesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  durationSeconds: integer("duration_seconds"),
  order: integer("order").notNull().default(0),
  videoType: text("video_type").notNull().default("embed"),
  createdByExternalUserId: text("created_by_external_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVideoSchema = createInsertSchema(videosTable).omit({ id: true, createdAt: true });
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Video = typeof videosTable.$inferSelect;
