ALTER TABLE "videos"
  ADD COLUMN "document_id" integer;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'videos_document_id_documents_id_fk') THEN
    ALTER TABLE "videos"
      ADD CONSTRAINT "videos_document_id_documents_id_fk"
      FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL;
  END IF;
END $$;
