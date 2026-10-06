-- Planning Center Groups attendance history by group and week (see
-- lib/db/src/schema/weeklyPulse.ts). Additive only: one new table.
CREATE TABLE IF NOT EXISTS "groups_weekly_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "group_id" text NOT NULL,
  "group_name" text NOT NULL,
  "group_archived" boolean DEFAULT false NOT NULL,
  "week_start" date NOT NULL,
  "week_end" date NOT NULL,
  "meetings" integer NOT NULL,
  "attendees" integer,
  "attendance_records" integer NOT NULL,
  "fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "groups_weekly_history_group_week_idx" ON "groups_weekly_history" USING btree ("group_id","week_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "groups_weekly_history_week_start_idx" ON "groups_weekly_history" USING btree ("week_start");
