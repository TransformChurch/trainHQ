ALTER TABLE "wiki_articles"
  DROP CONSTRAINT "wiki_articles_wiki_category_fk";

DROP INDEX "wiki_categories_wiki_id_unique";

ALTER TABLE "wiki_categories"
  ADD CONSTRAINT "wiki_categories_wiki_key_id_unique"
  UNIQUE ("wiki_key", "id");

ALTER TABLE "wiki_articles"
  ADD CONSTRAINT "wiki_articles_wiki_category_fk"
  FOREIGN KEY ("wiki_key", "category_id")
  REFERENCES "wiki_categories" ("wiki_key", "id")
  ON DELETE CASCADE;