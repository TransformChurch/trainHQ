ALTER TABLE "report_templates"
  ALTER COLUMN "original_file_name" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "report_templates"
  ALTER COLUMN "object_path" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "report_templates"
  ADD COLUMN "engine" text;
