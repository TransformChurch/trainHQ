import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { modulesTable } from "./modules";
import { documentsTable } from "./documents";

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
  // Optional file (from the document repository) shown just under this
  // video's description -- e.g. a worksheet or handout to go with it. Unlike
  // a document-type module's documentId (RESTRICT -- the document IS the
  // module's content), this is just an accompaniment, so deleting the
  // document simply un-links it from the video instead of being blocked.
  documentId: integer("document_id").references(() => documentsTable.id, { onDelete: "set null" }),
  createdByExternalUserId: text("created_by_external_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVideoSchema = createInsertSchema(videosTable).omit({ id: true, createdAt: true });
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Video = typeof videosTable.$inferSelect;
