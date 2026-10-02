ALTER TABLE "weekly_pulse_config" ADD COLUMN "pco_forms" text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
UPDATE "weekly_pulse_config"
SET "pco_forms" = CASE
  WHEN "pco_form_id" IS NOT NULL AND "pco_form_id" <> '' THEN
    json_build_array(json_build_object('formId', "pco_form_id", 'fieldId', "pco_form_field_id"))::text
  ELSE '[]'
END
WHERE "pco_form_id" IS NOT NULL AND "pco_form_id" <> '';
--> statement-breakpoint
-- NOTE (2026-10-02): on the live Supabase project, these two DROP COLUMN
-- statements reliably hung (180s+) and never committed -- most likely
-- Supabase's sql_drop event trigger (schema-cache reload) stalling on this
-- project, not a lock conflict (pg_locks showed nothing blocking). They were
-- left un-applied there; pco_form_id/pco_form_field_id remain in place as
-- harmless orphaned, nullable columns the app no longer reads or writes.
-- Keep these statements for a fresh environment where drizzle-kit applies
-- the full migration chain -- if a future apply hangs the same way there
-- too, it's safe to drop this statement-breakpoint pair and leave the
-- columns orphaned again.
ALTER TABLE "weekly_pulse_config" DROP COLUMN "pco_form_id";
--> statement-breakpoint
ALTER TABLE "weekly_pulse_config" DROP COLUMN "pco_form_field_id";
