-- Engagement dashboard "People" view (2026-11-10): one row per person per
-- Monday snapshot with their engagement score and green/yellow/red tier, plus
-- the state of the Giving field, so week-to-week drops and giving changes can
-- be flagged. See lib/db/src/schema/engagement.ts and
-- artifacts/api-server/src/lib/engagementPeople.ts. Additive only.
CREATE TABLE IF NOT EXISTS "engagement_person_snapshots" (
  "week_start" date NOT NULL,
  "person_id" text NOT NULL,
  "score" integer,
  "tier" text,
  "items" text,
  "giving_has" boolean DEFAULT false NOT NULL,
  "giving_date" date,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "engagement_person_snapshots_week_start_person_id_pk" PRIMARY KEY("week_start","person_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "engagement_person_snapshots_person_idx" ON "engagement_person_snapshots" USING btree ("person_id");
--> statement-breakpoint
-- Server-only table: RLS on with no policies, like every other public table
-- (Supabase security lockdown, 2026-11-04).
ALTER TABLE "engagement_person_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Same for the 0041 tables (already on in production after the 11/04
-- lockdown; harmless if so, and covers a fresh database).
ALTER TABLE "engagement_weeks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "engagement_attendance" ENABLE ROW LEVEL SECURITY;
