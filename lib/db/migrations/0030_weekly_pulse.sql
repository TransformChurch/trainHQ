CREATE TABLE IF NOT EXISTS "weekly_pulse_config" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text DEFAULT 'Weekly Attendance Pulse' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "recipient_emails" text NOT NULL,
  "checkins_event_ids" text DEFAULT '[]' NOT NULL,
  "group_ids" text DEFAULT '[]' NOT NULL,
  "pco_form_id" text,
  "pco_form_field_id" text,
  "created_by_user_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "last_run_at" timestamp,
  "last_run_status" text,
  "last_run_error" text
);
--> statement-breakpoint
ALTER TABLE "weekly_pulse_config" ADD CONSTRAINT "weekly_pulse_config_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
