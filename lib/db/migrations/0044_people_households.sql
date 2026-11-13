-- Household ids on people profiles (2026-11-13), so report map pages can
-- place people with no address of their own (most kids) at their household's
-- address. Filled by the next people sync.
ALTER TABLE "people_profiles" ADD COLUMN IF NOT EXISTS "household_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_profiles_household_ids_idx" ON "people_profiles" USING gin ("household_ids");
