DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "wiki_articles" a
    JOIN "wiki_categories" c ON c."id" = a."category_id"
    WHERE a."wiki_key" <> c."wiki_key"
  ) THEN
    RAISE EXCEPTION 'Cannot enforce Wiki category scope: cross-Wiki article references exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "wiki_categories_wiki_id_unique" ON "wiki_categories" ("wiki_key", "id");

ALTER TABLE "wiki_articles"
  ADD CONSTRAINT "wiki_articles_wiki_category_fk"
  FOREIGN KEY ("wiki_key", "category_id")
  REFERENCES "wiki_categories" ("wiki_key", "id")
  ON DELETE CASCADE;

ALTER TABLE "wiki_articles"
  DROP CONSTRAINT "wiki_articles_category_id_wiki_categories_id_fk";