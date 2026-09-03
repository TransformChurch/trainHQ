CREATE TABLE "report_scripts" (
  "slot" text PRIMARY KEY NOT NULL,
  "original_file_name" text NOT NULL,
  "object_path" text NOT NULL,
  "uploaded_by_user_id" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_scripts" ADD CONSTRAINT "report_scripts_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;