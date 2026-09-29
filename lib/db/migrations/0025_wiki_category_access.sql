CREATE TABLE "wiki_category_access" (
  "id" serial PRIMARY KEY,
  "category_id" integer NOT NULL REFERENCES "wiki_categories"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "granted_by_external_user_id" text NOT NULL,
  "granted_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "wiki_category_access_category_user_unique" ON "wiki_category_access" ("category_id", "user_id");

CREATE TABLE "wiki_category_group_access" (
  "id" serial PRIMARY KEY,
  "category_id" integer NOT NULL REFERENCES "wiki_categories"("id") ON DELETE CASCADE,
  "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "granted_by_external_user_id" text NOT NULL,
  "granted_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "wiki_category_group_access_category_group_unique" ON "wiki_category_group_access" ("category_id", "group_id");