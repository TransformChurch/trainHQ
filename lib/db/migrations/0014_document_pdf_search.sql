ALTER TABLE "documents" ADD COLUMN "pdf_text" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "pdf_text_status" text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "pdf_text_extracted_at" timestamp;
--> statement-breakpoint
CREATE INDEX "documents_pdf_text_search_idx" ON "documents" USING gin (to_tsvector('english', coalesce("pdf_text", '')));