-- Weekly Pulse run history + master tracker (see lib/db/src/schema/weeklyPulse.ts).
-- Additive only: two new tables, no changes to existing ones.
CREATE TABLE IF NOT EXISTS "weekly_pulse_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "config_id" integer,
  "config_name" text NOT NULL,
  "trigger" text NOT NULL,
  "week_start" date NOT NULL,
  "week_end" date NOT NULL,
  "counts_toward_tracker" boolean DEFAULT false NOT NULL,
  "email_status" text,
  "email_error" text,
  "ran_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_pulse_metrics" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_id" integer NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "source_name" text NOT NULL,
  "field_label" text,
  "detail" text,
  "value" integer,
  "warning" text
);
--> statement-breakpoint
ALTER TABLE "weekly_pulse_runs" ADD CONSTRAINT "weekly_pulse_runs_config_id_weekly_pulse_config_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."weekly_pulse_config"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "weekly_pulse_metrics" ADD CONSTRAINT "weekly_pulse_metrics_run_id_weekly_pulse_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."weekly_pulse_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "weekly_pulse_runs_config_id_idx" ON "weekly_pulse_runs" USING btree ("config_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "weekly_pulse_runs_week_start_idx" ON "weekly_pulse_runs" USING btree ("week_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "weekly_pulse_metrics_run_id_idx" ON "weekly_pulse_metrics" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "weekly_pulse_metrics_source_idx" ON "weekly_pulse_metrics" USING btree ("source_type","source_id");
