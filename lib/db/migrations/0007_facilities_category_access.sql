CREATE TABLE IF NOT EXISTS "facilities_category_access" (
  "id" serial PRIMARY KEY NOT NULL,
  "category_id" integer NOT NULL,
  "user_id" text NOT NULL,
  "granted_by_external_user_id" text NOT NULL,
  "granted_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "facilities_category_access_category_id_facilities_categories_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "public"."facilities_categories"("id") ON DELETE cascade,
  CONSTRAINT "facilities_category_access_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "facilities_category_access_category_user_unique"
  ON "facilities_category_access" USING btree ("category_id","user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "facilities_category_group_access" (
  "id" serial PRIMARY KEY NOT NULL,
  "category_id" integer NOT NULL,
  "group_id" integer NOT NULL,
  "granted_by_external_user_id" text NOT NULL,
  "granted_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "facilities_category_group_access_category_id_facilities_categories_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "public"."facilities_categories"("id") ON DELETE cascade,
  CONSTRAINT "facilities_category_group_access_group_id_groups_id_fk"
    FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "facilities_category_group_access_unique"
  ON "facilities_category_group_access" USING btree ("category_id","group_id");