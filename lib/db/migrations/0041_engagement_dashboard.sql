-- Engagement dashboard (2026-10-27): weekly attendance per tracked item
-- (Check-Ins event, group, or group type) with Planning Center person ids,
-- filled by the Monday 6 AM Eastern engagement sync for the items picked in
-- Tool Management. See lib/db/src/schema/engagement.ts. Additive only: two
-- new tables.
CREATE TABLE IF NOT EXISTS "engagement_weeks" (
  "item_kind" text NOT NULL,
  "item_id" text NOT NULL,
  "week_start" date NOT NULL,
  "sessions" integer NOT NULL,
  "attendees" integer,
  "roster" integer,
  "first_timers" integer DEFAULT 0 NOT NULL,
  "fetched_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "engagement_weeks_item_kind_item_id_week_start_pk" PRIMARY KEY("item_kind","item_id","week_start")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "engagement_weeks_week_start_idx" ON "engagement_weeks" USING btree ("week_start");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "engagement_attendance" (
  "item_kind" text NOT NULL,
  "item_id" text NOT NULL,
  "week_start" date NOT NULL,
  "person_id" text NOT NULL,
  "first_time" boolean DEFAULT false NOT NULL,
  CONSTRAINT "engagement_attendance_item_kind_item_id_week_start_person_id_pk" PRIMARY KEY("item_kind","item_id","week_start","person_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "engagement_attendance_person_idx" ON "engagement_attendance" USING btree ("person_id");
