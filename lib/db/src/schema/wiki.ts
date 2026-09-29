import { boolean, integer, pgTable, serial, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { groupsTable } from "./groups";

export const wikiCategoriesTable = pgTable(
  "wiki_categories",
  {
    id: serial("id").primaryKey(),
    wikiKey: text("wiki_key").notNull().default("wiki"),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdByExternalUserId: text("created_by_external_user_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    driveFolderId: text("drive_folder_id"),
    driveSyncManaged: boolean("drive_sync_managed").notNull().default(false),
    driveSyncCreated: boolean("drive_sync_created").notNull().default(false),
  },
  (table) => [
    uniqueIndex("wiki_categories_wiki_slug_unique").on(table.wikiKey, table.slug),
    uniqueIndex("wiki_categories_wiki_name_unique").on(table.wikiKey, table.name),
    uniqueIndex("wiki_categories_drive_folder_unique").on(table.driveFolderId),
    unique("wiki_categories_wiki_key_id_unique").on(table.wikiKey, table.id),
  ],
);

export const wikiArticlesTable = pgTable(
  "wiki_articles",
  {
    id: serial("id").primaryKey(),
    wikiKey: text("wiki_key").notNull().default("wiki"),
    categoryId: integer("category_id").notNull().references(
      () => wikiCategoriesTable.id,
      { onDelete: "cascade" },
    ),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    content: text("content").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdByExternalUserId: text("created_by_external_user_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    driveFileId: text("drive_file_id"),
    driveSourceUrl: text("drive_source_url"),
    driveModifiedAt: timestamp("drive_modified_at", { withTimezone: true }),
    driveSyncManaged: boolean("drive_sync_managed").notNull().default(false),
  },
  (table) => [
    uniqueIndex("wiki_articles_wiki_slug_unique").on(table.wikiKey, table.slug),
    uniqueIndex("wiki_articles_drive_file_unique").on(table.driveFileId),
  ],
);

export const wikiAccessTable = pgTable(
  "wiki_access",
  {
    id: serial("id").primaryKey(),
    wikiKey: text("wiki_key").notNull().default("wiki"),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    grantedByExternalUserId: text("granted_by_external_user_id").notNull(),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("wiki_access_wiki_user_unique").on(table.wikiKey, table.userId)],
);

export const wikiGroupAccessTable = pgTable(
  "wiki_group_access",
  {
    id: serial("id").primaryKey(),
    wikiKey: text("wiki_key").notNull().default("wiki"),
    groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
    grantedByExternalUserId: text("granted_by_external_user_id").notNull(),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("wiki_group_access_wiki_group_unique").on(table.wikiKey, table.groupId)],
);

export const wikiCategoryAccessTable = pgTable(
  "wiki_category_access",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id").notNull().references(() => wikiCategoriesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    grantedByExternalUserId: text("granted_by_external_user_id").notNull(),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("wiki_category_access_category_user_unique").on(table.categoryId, table.userId)],
);

export const wikiCategoryGroupAccessTable = pgTable(
  "wiki_category_group_access",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id").notNull().references(() => wikiCategoriesTable.id, { onDelete: "cascade" }),
    groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
    grantedByExternalUserId: text("granted_by_external_user_id").notNull(),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("wiki_category_group_access_category_group_unique").on(table.categoryId, table.groupId)],
);

export type WikiCategory = typeof wikiCategoriesTable.$inferSelect;
export type WikiArticle = typeof wikiArticlesTable.$inferSelect;
export type WikiAccess = typeof wikiAccessTable.$inferSelect;
export type WikiGroupAccess = typeof wikiGroupAccessTable.$inferSelect;
