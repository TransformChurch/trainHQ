import { pgTable, serial, text, integer, timestamp, pgEnum, smallint } from "drizzle-orm/pg-core";

export const docResourceTypeEnum = pgEnum("doc_resource_type", ["file", "folder"]);
export const docAccessPrincipalEnum = pgEnum("doc_access_principal", ["group", "user"]);

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  driveUrl: text("drive_url"),
  resourceType: docResourceTypeEnum("resource_type").notNull().default("file"),
  parentId: integer("parent_id"),
  sortOrder: smallint("sort_order").notNull().default(0),
  createdByClerkId: text("created_by_clerk_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const documentAccessTable = pgTable("document_access", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  principalType: docAccessPrincipalEnum("principal_type").notNull(),
  principalId: text("principal_id").notNull(),
  grantedByClerkId: text("granted_by_clerk_id"),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
});

export type Document = typeof documentsTable.$inferSelect;
export type DocumentAccess = typeof documentAccessTable.$inferSelect;
