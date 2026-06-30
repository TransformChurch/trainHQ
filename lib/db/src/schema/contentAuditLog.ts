import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const contentAuditLogTable = pgTable("content_audit_log", {
  id: serial("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  entityName: text("entity_name").notNull(),
  trackId: integer("track_id"),
  trackName: text("track_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ContentAuditLog = typeof contentAuditLogTable.$inferSelect;
