import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { modulesTable } from "./modules";

export const planningCenterOAuthStatesTable = pgTable("planning_center_oauth_states", {
  state: text("state").primaryKey(),
  codeVerifierEncrypted: text("code_verifier_encrypted").notNull(),
  returnTo: text("return_to").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const planningCenterTokensTable = pgTable("planning_center_tokens", {
  userId: text("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  accessTokenExpiresAt: timestamp("access_token_expires_at").notNull(),
  scope: text("scope"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const moduleCompletionsTable = pgTable("module_completions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  moduleId: integer("module_id").notNull().references(() => modulesTable.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
}, (table) => [
  unique("module_completions_user_module_unique").on(table.userId, table.moduleId),
]);

export type PlanningCenterOAuthState = typeof planningCenterOAuthStatesTable.$inferSelect;
export type PlanningCenterToken = typeof planningCenterTokensTable.$inferSelect;
export type ModuleCompletion = typeof moduleCompletionsTable.$inferSelect;