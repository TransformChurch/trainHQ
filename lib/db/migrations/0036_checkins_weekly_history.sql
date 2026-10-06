-- Check-Ins attendance history by event and week (see lib/db/src/schema/weeklyPulse.ts).
-- Additive only: one new table.
CREATE TABLE IF NOT EXISTS "checkins_weekly_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_id" text NOT NULL,
  "event_name" text NOT NULL,
  "event_archived" boolean DEFAULT false NOT NULL,
  "week_start" date NOT NULL,
  "week_end" date NOT NULL,
  "unique_attendees" integer NOT NULL,
  "total_check_ins" integer NOT NULL,
  "sessions" integer NOT NULL,
  "fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "checkins_weekly_history_event_week_idx" ON "checkins_weekly_history" USING btree ("event_id","week_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkins_weekly_history_week_start_idx" ON "checkins_weekly_history" USING btree ("week_start");
