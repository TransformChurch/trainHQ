import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const contentEditorGrantsTable = pgTable("content_editor_grants", {
  id: serial("id").primaryKey(),
  contentType: text("content_type").notNull(), // "track" | "module" | "video" | "document"
  contentId: integer("content_id").notNull(),
  granteeExternalUserId: text("grantee_external_user_id").notNull(),
  grantedByExternalUserId: text("granted_by_external_user_id").notNull(),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
});

export type ContentEditorGrant = typeof contentEditorGrantsTable.$inferSelect;
