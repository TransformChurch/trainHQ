ALTER TABLE "wiki_categories"
  ADD COLUMN "drive_folder_id" text,
  ADD COLUMN "drive_sync_managed" boolean DEFAULT false NOT NULL;

ALTER TABLE "wiki_articles"
  ADD COLUMN "drive_file_id" text,
  ADD COLUMN "drive_source_url" text,
  ADD COLUMN "drive_modified_at" timestamp with time zone,
  ADD COLUMN "drive_sync_managed" boolean DEFAULT false NOT NULL;

CREATE UNIQUE INDEX "wiki_articles_drive_file_unique"
  ON "wiki_articles" ("drive_file_id");

CREATE UNIQUE INDEX "wiki_categories_drive_folder_unique"
  ON "wiki_categories" ("drive_folder_id");