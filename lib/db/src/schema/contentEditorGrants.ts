import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const contentEditorGrantsTable = pgTable("content_editor_grants", {
  id: serial("id").primaryKey(),
  contentType: text("content_type").notNull(), // "track" | "module" | "video" | "document"
  contentId: integer("content_id").notNull(),
  granteeClerkId: text("grantee_clerk_id").notNull(),
  grantedByClerkId: text("granted_by_clerk_id").notNull(),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
});

export type ContentEditorGrant = typeof contentEditorGrantsTable.$inferSelect;
