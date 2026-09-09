import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tracksTable = pgTable("tracks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  createdByExternalUserId: text("created_by_external_user_id"),
  pcoAssignedFieldId: text("pco_assigned_field_id"),
  pcoCompletedFieldId: text("pco_completed_field_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTrackSchema = createInsertSchema(tracksTable).omit({ id: true, createdAt: true });
export type InsertTrack = z.infer<typeof insertTrackSchema>;
export type Track = typeof tracksTable.$inferSelect;
