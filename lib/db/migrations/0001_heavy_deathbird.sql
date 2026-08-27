DO $$ BEGIN CREATE TYPE "public"."role" AS ENUM('student', 'manager', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."drive_resource_type" AS ENUM('file', 'folder'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."join_request_status" AS ENUM('pending', 'approved', 'denied'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."doc_access_principal" AS ENUM('group', 'user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."doc_resource_type" AS ENUM('file', 'folder'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"external_user_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"role" "role" DEFAULT 'student' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_external_user_id_unique" UNIQUE("external_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"created_by_external_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"track_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"image_url" text,
	"order" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_by_external_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"duration_seconds" integer,
	"order" integer DEFAULT 0 NOT NULL,
	"video_type" text DEFAULT 'embed' NOT NULL,
	"created_by_external_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"module_id" integer NOT NULL,
	"assigned_by" text NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"due_date" timestamp,
	"seen_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watch_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"last_watched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" integer NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quiz_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_id" integer NOT NULL,
	"question_text" text NOT NULL,
	"options" text[] NOT NULL,
	"correct_index" integer NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quiz_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"module_id" integer NOT NULL,
	"score" integer NOT NULL,
	"total_questions" integer NOT NULL,
	"passed" boolean NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"taken_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_drive_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"label" text NOT NULL,
	"drive_url" text NOT NULL,
	"resource_type" "drive_resource_type" NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_join_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"status" "join_request_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_managers" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"entity_name" text NOT NULL,
	"track_id" integer,
	"track_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "growth_track_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"growth_track_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"enrolled_by" text NOT NULL,
	"current_step_order" integer DEFAULT 1 NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "growth_track_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"growth_track_id" integer NOT NULL,
	"module_id" integer NOT NULL,
	"step_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "growth_tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_access" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"principal_type" "doc_access_principal" NOT NULL,
	"principal_id" text NOT NULL,
	"granted_by_external_user_id" text,
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"drive_url" text,
	"resource_type" "doc_resource_type" DEFAULT 'file' NOT NULL,
	"parent_id" integer,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_by_external_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_editor_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"content_id" integer NOT NULL,
	"grantee_external_user_id" text NOT NULL,
	"granted_by_external_user_id" text NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'modules_track_id_tracks_id_fk') THEN ALTER TABLE "modules" ADD CONSTRAINT "modules_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'videos_module_id_modules_id_fk') THEN ALTER TABLE "videos" ADD CONSTRAINT "videos_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_user_id_users_id_fk') THEN ALTER TABLE "assignments" ADD CONSTRAINT "assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_module_id_modules_id_fk') THEN ALTER TABLE "assignments" ADD CONSTRAINT "assignments_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'watch_history_user_id_users_id_fk') THEN ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'watch_history_video_id_videos_id_fk') THEN ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'queue_user_id_users_id_fk') THEN ALTER TABLE "queue" ADD CONSTRAINT "queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'queue_video_id_videos_id_fk') THEN ALTER TABLE "queue" ADD CONSTRAINT "queue_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_questions_module_id_modules_id_fk') THEN ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_results_user_id_users_id_fk') THEN ALTER TABLE "quiz_results" ADD CONSTRAINT "quiz_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_results_module_id_modules_id_fk') THEN ALTER TABLE "quiz_results" ADD CONSTRAINT "quiz_results_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_drive_resources_group_id_groups_id_fk') THEN ALTER TABLE "group_drive_resources" ADD CONSTRAINT "group_drive_resources_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_join_requests_group_id_groups_id_fk') THEN ALTER TABLE "group_join_requests" ADD CONSTRAINT "group_join_requests_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_join_requests_user_id_users_id_fk') THEN ALTER TABLE "group_join_requests" ADD CONSTRAINT "group_join_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_managers_group_id_groups_id_fk') THEN ALTER TABLE "group_managers" ADD CONSTRAINT "group_managers_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_managers_user_id_users_id_fk') THEN ALTER TABLE "group_managers" ADD CONSTRAINT "group_managers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_members_group_id_groups_id_fk') THEN ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_members_user_id_users_id_fk') THEN ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'growth_track_enrollments_growth_track_id_growth_tracks_id_fk') THEN ALTER TABLE "growth_track_enrollments" ADD CONSTRAINT "growth_track_enrollments_growth_track_id_growth_tracks_id_fk" FOREIGN KEY ("growth_track_id") REFERENCES "public"."growth_tracks"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'growth_track_enrollments_user_id_users_id_fk') THEN ALTER TABLE "growth_track_enrollments" ADD CONSTRAINT "growth_track_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'growth_track_steps_growth_track_id_growth_tracks_id_fk') THEN ALTER TABLE "growth_track_steps" ADD CONSTRAINT "growth_track_steps_growth_track_id_growth_tracks_id_fk" FOREIGN KEY ("growth_track_id") REFERENCES "public"."growth_tracks"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'growth_track_steps_module_id_modules_id_fk') THEN ALTER TABLE "growth_track_steps" ADD CONSTRAINT "growth_track_steps_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_access_document_id_documents_id_fk') THEN ALTER TABLE "document_access" ADD CONSTRAINT "document_access_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_parent_id_documents_id_fk') THEN ALTER TABLE "documents" ADD CONSTRAINT "documents_parent_id_documents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."documents"("id") ON DELETE cascade; END IF;
END $$;