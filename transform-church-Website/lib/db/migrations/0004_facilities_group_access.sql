CREATE TABLE IF NOT EXISTS "facilities_group_access" (
  "id" serial PRIMARY KEY NOT NULL,
  "group_id" integer NOT NULL,
  "granted_by_external_user_id" text NOT NULL,
  "granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facilities_group_access_group_id_groups_id_fk') THEN
    ALTER TABLE "facilities_group_access"
      ADD CONSTRAINT "facilities_group_access_group_id_groups_id_fk"
      FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "facilities_group_access_group_id_unique"
  ON "facilities_group_access" ("group_id");