import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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

export type WikiCategory = typeof wikiCategoriesTable.$inferSelect;
export type WikiArticle = typeof wikiArticlesTable.$inferSelect;
