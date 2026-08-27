ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "planning_center_person_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_planning_center_person_id_unique"
  ON "users" ("planning_center_person_id")
  WHERE "planning_center_person_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "planning_center_oauth_states" (
  "state" text PRIMARY KEY NOT NULL,
  "code_verifier_encrypted" text NOT NULL,
  "return_to" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "planning_center_tokens" (
  "user_id" text PRIMARY KEY NOT NULL,
  "access_token_encrypted" text NOT NULL,
  "refresh_token_encrypted" text NOT NULL,
  "access_token_expires_at" timestamp NOT NULL,
  "scope" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "module_completions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "module_id" integer NOT NULL,
  "completed_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "module_completions_user_module_unique" UNIQUE("user_id","module_id")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_center_tokens_user_id_users_id_fk') THEN
    ALTER TABLE "planning_center_tokens"
      ADD CONSTRAINT "planning_center_tokens_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'module_completions_user_id_users_id_fk') THEN
    ALTER TABLE "module_completions"
      ADD CONSTRAINT "module_completions_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'module_completions_module_id_modules_id_fk') THEN
    ALTER TABLE "module_completions"
      ADD CONSTRAINT "module_completions_module_id_modules_id_fk"
      FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade;
  END IF;
END $$;