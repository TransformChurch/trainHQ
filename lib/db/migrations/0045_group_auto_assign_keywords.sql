-- Group auto-assignment by keywords + weekly sync (2026-11-18). A group's rule is now a
-- Planning Center field plus a list of keywords; a person matching ANY
-- keyword on ANY of their values for that field is added. The old
-- single-value pco_field_value is copied in as the first keyword and then no
-- longer read (left in place so an older deploy keeps working). Safe to run
-- more than once.
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "pco_field_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "groups"
SET "pco_field_keywords" = jsonb_build_array(btrim("pco_field_value"))
WHERE "pco_field_value" IS NOT NULL
  AND btrim("pco_field_value") <> ''
  AND "pco_field_keywords" = '[]'::jsonb;
--> statement-breakpoint
-- Who added each membership: "auto" (the group's Planning Center rule) or
-- "manual". The weekly sync only ever removes "auto" rows. Existing rows are
-- treated as manual, so nobody already in a group is removed by the sync.
ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual' NOT NULL;
