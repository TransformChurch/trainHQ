import { pgTable, serial, text, integer, timestamp, pgEnum, smallint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const groupsTable = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // When set, a user is automatically added to this group at login if their
  // Planning Center profile has this custom field equal to pcoFieldValue.
  pcoFieldDefinitionId: text("pco_field_definition_id"),
  pcoFieldDefinitionLabel: text("pco_field_definition_label"),
  pcoFieldValue: text("pco_field_value"),
});

export const groupMembersTable = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const groupManagersTable = pgTable("group_managers", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const joinRequestStatusEnum = pgEnum("join_request_status", ["pending", "approved", "denied"]);

export const groupJoinRequestsTable = pgTable("group_join_requests", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: joinRequestStatusEnum("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: text("reviewed_by"),
});

export const driveResourceTypeEnum = pgEnum("drive_resource_type", ["file", "folder"]);

export const groupDriveResourcesTable = pgTable("group_drive_resources", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  driveUrl: text("drive_url").notNull(),
  resourceType: driveResourceTypeEnum("resource_type").notNull(),
  sortOrder: smallint("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGroupSchema = createInsertSchema(groupsTable).omit({ id: true, createdAt: true });
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type Group = typeof groupsTable.$inferSelect;

export const insertGroupMemberSchema = createInsertSchema(groupMembersTable).omit({ id: true, addedAt: true });
export type InsertGroupMember = z.infer<typeof insertGroupMemberSchema>;
export type GroupMember = typeof groupMembersTable.$inferSelect;

export type GroupManager = typeof groupManagersTable.$inferSelect;
export type GroupJoinRequest = typeof groupJoinRequestsTable.$inferSelect;
export type GroupDriveResource = typeof groupDriveResourcesTable.$inferSelect;
