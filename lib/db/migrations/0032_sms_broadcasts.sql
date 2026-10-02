CREATE TABLE IF NOT EXISTS "sms_broadcasts" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text DEFAULT '' NOT NULL,
  "message" text NOT NULL,
  "source_type" text NOT NULL,
  "source_group_ids" text DEFAULT '[]' NOT NULL,
  "recipient_count" integer DEFAULT 0 NOT NULL,
  "success_count" integer DEFAULT 0 NOT NULL,
  "failure_count" integer DEFAULT 0 NOT NULL,
  "recipients" text DEFAULT '[]' NOT NULL,
  "sent_by_user_id" text NOT NULL,
  "sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_broadcasts_sent_by_user_id_users_id_fk') THEN
    ALTER TABLE "sms_broadcasts"
      ADD CONSTRAINT "sms_broadcasts_sent_by_user_id_users_id_fk"
      FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
  END IF;
END $$;
