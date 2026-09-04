CREATE TABLE "wiki_access" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "granted_by_external_user_id" text NOT NULL,
  "granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_group_access" (
  "id" serial PRIMARY KEY NOT NULL,
  "group_id" integer NOT NULL,
  "granted_by_external_user_id" text NOT NULL,
  "granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wiki_access" ADD CONSTRAINT "wiki_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "wiki_group_access" ADD CONSTRAINT "wiki_group_access_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_access_user_id_unique" ON "wiki_access" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_group_access_group_id_unique" ON "wiki_group_access" USING btree ("group_id");
--> statement-breakpoint
INSERT INTO "wiki_access" ("user_id", "granted_by_external_user_id")
SELECT "id", 'migration:preserve-existing-access'
FROM "users"
ON CONFLICT ("user_id") DO NOTHING;