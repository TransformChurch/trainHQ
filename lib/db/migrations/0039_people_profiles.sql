-- Local copy of Planning Center People profiles for reporting (see
-- lib/db/src/schema/people.ts). Additive only: one new table. Admin-picked
-- extra fields live in the "fields" jsonb column, so adding a column in the
-- app never needs another migration.
CREATE TABLE IF NOT EXISTS "people_profiles" (
  "person_id" text PRIMARY KEY NOT NULL,
  "first_name" text,
  "last_name" text,
  "birthdate" date,
  "gender" text,
  "grade" integer,
  "child" boolean,
  "membership" text,
  "status" text,
  "campus_id" text,
  "campus_name" text,
  "city" text,
  "state" text,
  "zip" text,
  "pco_created_at" timestamp,
  "pco_updated_at" timestamp,
  "fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "synced_at" timestamp DEFAULT now() NOT NULL,
  "removed_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_profiles_last_name_idx" ON "people_profiles" USING btree ("last_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_profiles_campus_idx" ON "people_profiles" USING btree ("campus_id");
--> statement-breakpoint
-- Added 2026-10-13 (city/state/zip from the primary address). Repeated here
-- so re-running this file also upgrades a table created by its first draft.
ALTER TABLE "people_profiles" ADD COLUMN IF NOT EXISTS "city" text;
--> statement-breakpoint
ALTER TABLE "people_profiles" ADD COLUMN IF NOT EXISTS "state" text;
--> statement-breakpoint
ALTER TABLE "people_profiles" ADD COLUMN IF NOT EXISTS "zip" text;
