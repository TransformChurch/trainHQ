-- Attendance tracker (checkins_weekly_history) additions used by the reports:
-- a gender split for the attendance trend, and weekly first-time guests (plus
-- how many of them came back to any later service) for the first-timer trend.
-- Additive only: five nullable columns.
ALTER TABLE "checkins_weekly_history" ADD COLUMN IF NOT EXISTS "male_attendees" integer;
--> statement-breakpoint
ALTER TABLE "checkins_weekly_history" ADD COLUMN IF NOT EXISTS "female_attendees" integer;
--> statement-breakpoint
ALTER TABLE "checkins_weekly_history" ADD COLUMN IF NOT EXISTS "unknown_gender_attendees" integer;
--> statement-breakpoint
ALTER TABLE "checkins_weekly_history" ADD COLUMN IF NOT EXISTS "first_timers" integer;
--> statement-breakpoint
ALTER TABLE "checkins_weekly_history" ADD COLUMN IF NOT EXISTS "first_timers_returned" integer;
