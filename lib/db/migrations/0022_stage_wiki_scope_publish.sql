ALTER TABLE "wiki_articles"
  DROP CONSTRAINT "wiki_articles_wiki_category_fk";

ALTER TABLE "wiki_articles"
  ADD CONSTRAINT "wiki_articles_category_id_wiki_categories_id_fk"
  FOREIGN KEY ("category_id")
  REFERENCES "wiki_categories" ("id")
  ON DELETE CASCADE;