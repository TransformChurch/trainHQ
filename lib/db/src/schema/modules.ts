import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tracksTable } from "./tracks";
import { documentsTable } from "./documents";

export const moduleContentTypeEnum = pgEnum("module_content_type", ["video", "document"]);

export const modulesTable = pgTable("modules", {
  id: serial("id").primaryKey(),
  trackId: integer("track_id").notNull().references(() => tracksTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  order: integer("order").notNull().default(0),
  isPublic: boolean("is_public").notNull().default(true),
  contentType: moduleContentTypeEnum("content_type").notNull().default("video"),
  documentId: integer("document_id").references(() => documentsTable.id, { onDelete: "restrict" }),
  createdByExternalUserId: text("created_by_external_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertModuleSchema = createInsertSchema(modulesTable).omit({ id: true, createdAt: true });
export type InsertModule = z.infer<typeof insertModuleSchema>;
export type Module = typeof modulesTable.$inferSelect;
