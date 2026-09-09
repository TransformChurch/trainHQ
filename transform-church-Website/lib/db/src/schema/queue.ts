import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { videosTable } from "./videos";

export const queueTable = pgTable("queue", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  videoId: integer("video_id").notNull().references(() => videosTable.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const insertQueueSchema = createInsertSchema(queueTable).omit({ id: true, addedAt: true });
export type InsertQueue = z.infer<typeof insertQueueSchema>;
export type Queue = typeof queueTable.$inferSelect;
