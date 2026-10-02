-- Audit finding 2.1 (Medium, AUDIT_LOG.md Phase 2): Supabase's performance
-- advisor flags 3 foreign-key columns added in this session's work as
-- unindexed. Migration 0029 covered every FK that existed at the time it
-- was written; these three were added afterward (weekly_pulse_config and
-- the sms_broadcasts -> group_broadcasts rename/extension in migrations
-- 0030/0033, and the video-linked-document feature in 0028/later work).
-- Purely additive -- CREATE INDEX IF NOT EXISTS, no app code depends on
-- these existing or not -- same reasoning as 0029.
--
-- NOT applied to the live database by this audit, per ground rule 2 ("never
-- run migrations... against a production database"). See AUDIT_REPORT.md
-- for the exact command to run this yourself, and for the separate,
-- unrelated migration-tracking issue (finding 2.3) that should be resolved
-- first -- drizzle.__drizzle_migrations does not exist on the live database
-- at all, so `npm run db:migrate` would currently try to replay every
-- migration from scratch rather than just this new one.
CREATE INDEX IF NOT EXISTS "idx_group_broadcasts_sent_by_user_id" ON "group_broadcasts" ("sent_by_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_videos_document_id" ON "videos" ("document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_weekly_pulse_config_created_by_user_id" ON "weekly_pulse_config" ("created_by_user_id");
