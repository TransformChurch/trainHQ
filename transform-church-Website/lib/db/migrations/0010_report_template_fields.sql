ALTER TABLE "report_templates"
  ADD COLUMN "pull_fields" text NOT NULL
  DEFAULT '["planning_center_id","first_name","last_name","birthdate","email","phone_mobile","gender","grade","first_timers"]';

ALTER TABLE "report_runs"
  ADD COLUMN "template_id" integer REFERENCES "report_templates"("id") ON DELETE SET NULL;