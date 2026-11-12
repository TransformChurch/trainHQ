-- Engagement score out of 17 points (2026-11-10): Planning Center form
-- submissions for the Form / Thrive part, and person snapshot scores become
-- points (decimals) instead of 0-100. Snapshots saved on the old 0-100 scale
-- are cleared so week-to-week comparisons start fresh.
CREATE TABLE IF NOT EXISTS "engagement_form_submissions" (
  "form_id" text NOT NULL,
  "person_id" text NOT NULL,
  "last_submitted_at" timestamp NOT NULL,
  "submissions" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "engagement_form_submissions_form_id_person_id_pk" PRIMARY KEY("form_id","person_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "engagement_form_submissions_person_idx" ON "engagement_form_submissions" USING btree ("person_id");
--> statement-breakpoint
ALTER TABLE "engagement_form_submissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DELETE FROM "engagement_person_snapshots";
--> statement-breakpoint
ALTER TABLE "engagement_person_snapshots" ALTER COLUMN "score" TYPE real;
