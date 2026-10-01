-- Covering indexes for foreign-key columns flagged by Supabase's performance
-- advisor as unindexed. Without these, every query that filters or joins on
-- one of these columns (e.g. the dashboard summary endpoint's per-user
-- lookups against assignments/quiz_results/watch_history/queue) falls back
-- to a full table scan -- cheap today while the tables are small, but it
-- gets linearly worse as usage grows, compounding with the database's
-- small (Nano-tier) compute allowance. Purely additive, no app code depends
-- on these existing or not, safe to run against a live database.
CREATE INDEX IF NOT EXISTS "idx_assignments_module_id" ON "assignments" ("module_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_assignments_user_id" ON "assignments" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_access_document_id" ON "document_access" ("document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_parent_id" ON "documents" ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_facilities_category_access_user_id" ON "facilities_category_access" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_facilities_category_group_access_group_id" ON "facilities_category_group_access" ("group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_facilities_requests_category_id" ON "facilities_requests" ("category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_group_drive_resources_group_id" ON "group_drive_resources" ("group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_group_join_requests_group_id" ON "group_join_requests" ("group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_group_join_requests_user_id" ON "group_join_requests" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_group_managers_group_id" ON "group_managers" ("group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_group_managers_user_id" ON "group_managers" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_group_members_group_id" ON "group_members" ("group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_group_members_user_id" ON "group_members" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_growth_track_enrollments_growth_track_id" ON "growth_track_enrollments" ("growth_track_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_growth_track_enrollments_user_id" ON "growth_track_enrollments" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_growth_track_steps_growth_track_id" ON "growth_track_steps" ("growth_track_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_growth_track_steps_module_id" ON "growth_track_steps" ("module_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_module_completions_module_id" ON "module_completions" ("module_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_modules_document_id" ON "modules" ("document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_modules_track_id" ON "modules" ("track_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_queue_user_id" ON "queue" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_queue_video_id" ON "queue" ("video_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quiz_questions_module_id" ON "quiz_questions" ("module_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quiz_results_module_id" ON "quiz_results" ("module_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quiz_results_user_id" ON "quiz_results" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_report_runs_requested_by_user_id" ON "report_runs" ("requested_by_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_report_runs_template_id" ON "report_runs" ("template_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_report_scripts_uploaded_by_user_id" ON "report_scripts" ("uploaded_by_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_report_templates_uploaded_by_user_id" ON "report_templates" ("uploaded_by_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_track_assignments_track_id" ON "track_assignments" ("track_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_track_completions_track_id" ON "track_completions" ("track_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_videos_module_id" ON "videos" ("module_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_watch_history_user_id" ON "watch_history" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_watch_history_video_id" ON "watch_history" ("video_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wiki_access_user_id" ON "wiki_access" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wiki_articles_category_id" ON "wiki_articles" ("category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wiki_category_access_user_id" ON "wiki_category_access" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wiki_category_group_access_group_id" ON "wiki_category_group_access" ("group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wiki_group_access_group_id" ON "wiki_group_access" ("group_id");
