DO $$ BEGIN
  CREATE TYPE "public"."module_content_type" AS ENUM('video', 'document');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "modules"
  ADD COLUMN IF NOT EXISTS "content_type" "module_content_type" DEFAULT 'video' NOT NULL;
--> statement-breakpoint
ALTER TABLE "modules"
  ADD COLUMN IF NOT EXISTS "document_id" integer;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'modules_document_id_documents_id_fk') THEN
    ALTER TABLE "modules"
      ADD CONSTRAINT "modules_document_id_documents_id_fk"
      FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE RESTRICT;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'modules_content_type_document_id_check') THEN
    ALTER TABLE "modules"
      ADD CONSTRAINT "modules_content_type_document_id_check"
      CHECK (
        ("content_type" = 'video' AND "document_id" IS NULL)
        OR ("content_type" = 'document' AND "document_id" IS NOT NULL)
      );
  END IF;
END $$;