import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { groupsTable } from "./groups";

export const wikiCategoriesTable = pgTable(
  "wiki_categories",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull().unique(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdByExternalUserId: text("created_by_external_user_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("wiki_categories_slug_unique").on(table.slug)],
);

export const wikiArticlesTable = pgTable(
  "wiki_articles",
  {
    id: serial("id").primaryKey(),
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
  },
  (table) => [uniqueIndex("wiki_articles_slug_unique").on(table.slug)],
);

export const wikiAccessTable = pgTable(
  "wiki_access",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    grantedByExternalUserId: text("granted_by_external_user_id").notNull(),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("wiki_access_user_id_unique").on(table.userId)],
);

export const wikiGroupAccessTable = pgTable(
  "wiki_group_access",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
    grantedByExternalUserId: text("granted_by_external_user_id").notNull(),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("wiki_group_access_group_id_unique").on(table.groupId)],
);

export type WikiCategory = typeof wikiCategoriesTable.$inferSelect;
export type WikiArticle = typeof wikiArticlesTable.$inferSelect;
export type WikiAccess = typeof wikiAccessTable.$inferSelect;
export type WikiGroupAccess = typeof wikiGroupAccessTable.$inferSelect;
