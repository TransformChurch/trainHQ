ALTER TABLE "wiki_categories" ADD COLUMN "wiki_key" text DEFAULT 'wiki' NOT NULL;
ALTER TABLE "wiki_articles" ADD COLUMN "wiki_key" text DEFAULT 'wiki' NOT NULL;
ALTER TABLE "wiki_access" ADD COLUMN "wiki_key" text DEFAULT 'wiki' NOT NULL;
ALTER TABLE "wiki_group_access" ADD COLUMN "wiki_key" text DEFAULT 'wiki' NOT NULL;

DROP INDEX IF EXISTS "wiki_categories_slug_unique";
ALTER TABLE "wiki_categories" DROP CONSTRAINT IF EXISTS "wiki_categories_name_unique";
DROP INDEX IF EXISTS "wiki_articles_slug_unique";
DROP INDEX IF EXISTS "wiki_access_user_id_unique";
DROP INDEX IF EXISTS "wiki_group_access_group_id_unique";

CREATE UNIQUE INDEX "wiki_categories_wiki_slug_unique" ON "wiki_categories" ("wiki_key", "slug");
CREATE UNIQUE INDEX "wiki_categories_wiki_name_unique" ON "wiki_categories" ("wiki_key", "name");
CREATE UNIQUE INDEX "wiki_articles_wiki_slug_unique" ON "wiki_articles" ("wiki_key", "slug");
CREATE UNIQUE INDEX "wiki_access_wiki_user_unique" ON "wiki_access" ("wiki_key", "user_id");
CREATE UNIQUE INDEX "wiki_group_access_wiki_group_unique" ON "wiki_group_access" ("wiki_key", "group_id");