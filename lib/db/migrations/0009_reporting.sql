CREATE TABLE "report_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "original_file_name" text NOT NULL,
  "object_path" text NOT NULL,
  "uploaded_by_user_id" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "report_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "event_id" text NOT NULL,
  "event_name" text NOT NULL,
  "start_date" text NOT NULL,
  "end_date" text NOT NULL,
  "cleaned_object_path" text NOT NULL,
  "requested_by_user_id" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL
);

CREATE INDEX "report_runs_expires_at_idx" ON "report_runs" ("expires_at");