ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "pco_assigned_field_id" text;
--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "pco_completed_field_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "track_assignments" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "track_id" integer NOT NULL,
  "assigned_by" text NOT NULL,
  "assigned_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "track_assignments_user_track_unique" UNIQUE("user_id","track_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "track_completions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "track_id" integer NOT NULL,
  "completed_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "track_completions_user_track_unique" UNIQUE("user_id","track_id")
);
--> statement-breakpoint
ALTER TABLE "track_assignments" ADD CONSTRAINT "track_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "track_assignments" ADD CONSTRAINT "track_assignments_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "track_completions" ADD CONSTRAINT "track_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "track_completions" ADD CONSTRAINT "track_completions_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;