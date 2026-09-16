import { boolean, foreignKey, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
  },
  (table) => [
    uniqueIndex("wiki_categories_wiki_slug_unique").on(table.wikiKey, table.slug),
    uniqueIndex("wiki_categories_wiki_name_unique").on(table.wikiKey, table.name),
    uniqueIndex("wiki_categories_wiki_id_unique").on(table.wikiKey, table.id),
  ],
);

export const wikiArticlesTable = pgTable(
  "wiki_articles",
  {
    id: serial("id").primaryKey(),
    wikiKey: text("wiki_key").notNull().default("wiki"),
    categoryId: integer("category_id").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    content: text("content").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdByExternalUserId: text("created_by_external_user_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("wiki_articles_wiki_slug_unique").on(table.wikiKey, table.slug),
    foreignKey({
      columns: [table.wikiKey, table.categoryId],
      foreignColumns: [wikiCategoriesTable.wikiKey, wikiCategoriesTable.id],
      name: "wiki_articles_wiki_category_fk",
    }).onDelete("cascade"),
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

export type WikiCategory = typeof wikiCategoriesTable.$inferSelect;
export type WikiArticle = typeof wikiArticlesTable.$inferSelect;
export type WikiAccess = typeof wikiAccessTable.$inferSelect;
export type WikiGroupAccess = typeof wikiGroupAccessTable.$inferSelect;
