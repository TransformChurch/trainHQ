ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "mime_type" text;
--> statement-breakpoint
UPDATE "documents"
SET "mime_type" = CASE
  WHEN lower("title") LIKE '%.pdf' THEN 'application/pdf'
  WHEN lower("title") LIKE '%.jpg' OR lower("title") LIKE '%.jpeg' THEN 'image/jpeg'
  WHEN lower("title") LIKE '%.png' THEN 'image/png'
  WHEN lower("title") LIKE '%.gif' THEN 'image/gif'
  WHEN lower("title") LIKE '%.webp' THEN 'image/webp'
  WHEN lower("title") LIKE '%.txt' THEN 'text/plain'
  WHEN lower("title") LIKE '%.csv' THEN 'text/csv'
  WHEN lower("title") LIKE '%.doc' THEN 'application/msword'
  WHEN lower("title") LIKE '%.docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  WHEN lower("title") LIKE '%.xls' THEN 'application/vnd.ms-excel'
  WHEN lower("title") LIKE '%.xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  WHEN lower("title") LIKE '%.ppt' THEN 'application/vnd.ms-powerpoint'
  WHEN lower("title") LIKE '%.pptx' THEN 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  WHEN lower("title") LIKE '%.zip' THEN 'application/zip'
  ELSE NULL
END
WHERE "mime_type" IS NULL;