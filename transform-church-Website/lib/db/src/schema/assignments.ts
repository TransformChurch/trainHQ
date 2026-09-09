import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { modulesTable } from "./modules";

export const assignmentsTable = pgTable("assignments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  moduleId: integer("module_id").notNull().references(() => modulesTable.id, { onDelete: "cascade" }),
  assignedBy: text("assigned_by").notNull(),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  dueDate: timestamp("due_date"),
  seenAt: timestamp("seen_at"),
});

export const insertAssignmentSchema = createInsertSchema(assignmentsTable).omit({ id: true, assignedAt: true });
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;
export type Assignment = typeof assignmentsTable.$inferSelect;
