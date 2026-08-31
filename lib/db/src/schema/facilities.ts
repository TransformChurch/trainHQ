import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const facilitiesCategoriesTable = pgTable("facilities_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdByExternalUserId: text("created_by_external_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const facilitiesRequestsTable = pgTable("facilities_requests", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(
    () => facilitiesCategoriesTable.id,
    { onDelete: "cascade" },
  ),
  eyebrow: text("eyebrow"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  useWhen: text("use_when"),
  url: text("url").notNull(),
  buttonLabel: text("button_label").notNull().default("Open form →"),
  icon: text("icon").notNull().default("wrench"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdByExternalUserId: text("created_by_external_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const facilitiesAccessTable = pgTable(
  "facilities_access",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    grantedByExternalUserId: text("granted_by_external_user_id").notNull(),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("facilities_access_user_id_unique").on(table.userId)],
);

export type FacilitiesCategory = typeof facilitiesCategoriesTable.$inferSelect;
export type FacilitiesRequest = typeof facilitiesRequestsTable.$inferSelect;
export type FacilitiesAccess = typeof facilitiesAccessTable.$inferSelect;