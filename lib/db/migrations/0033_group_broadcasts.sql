-- "sms_broadcasts" (migration 0032) is renamed/extended here rather than
-- dropped and recreated, even though it still has zero rows on the live
-- database: DROP COLUMN has proven unreliable against this Supabase project
-- (reliably hangs 180s+, apparently a slow sql_drop event trigger -- see
-- migration 0031's comment), and DROP TABLE fires that same event, so this
-- sticks to RENAME/ADD, which have both been fast and reliable so far.
ALTER TABLE "sms_broadcasts" RENAME TO "group_broadcasts";
--> statement-breakpoint
ALTER TABLE "group_broadcasts" ADD COLUMN "channel" text DEFAULT 'sms' NOT NULL;
--> statement-breakpoint
ALTER TABLE "group_broadcasts" ADD COLUMN "subject" text;
--> statement-breakpoint
ALTER TABLE "group_broadcasts" ADD COLUMN "estimated_cost_usd" text;
--> statement-breakpoint
ALTER TABLE "group_broadcasts" RENAME CONSTRAINT "sms_broadcasts_sent_by_user_id_users_id_fk" TO "group_broadcasts_sent_by_user_id_users_id_fk";
