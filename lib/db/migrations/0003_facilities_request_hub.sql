CREATE TABLE IF NOT EXISTS "facilities_categories" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by_external_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "facilities_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "facilities_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "category_id" integer NOT NULL,
  "eyebrow" text,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "use_when" text,
  "url" text NOT NULL,
  "button_label" text DEFAULT 'Open form →' NOT NULL,
  "icon" text DEFAULT 'wrench' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by_external_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "facilities_access" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "granted_by_external_user_id" text NOT NULL,
  "granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facilities_requests_category_id_facilities_categories_id_fk') THEN
    ALTER TABLE "facilities_requests"
      ADD CONSTRAINT "facilities_requests_category_id_facilities_categories_id_fk"
      FOREIGN KEY ("category_id") REFERENCES "public"."facilities_categories"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facilities_access_user_id_users_id_fk') THEN
    ALTER TABLE "facilities_access"
      ADD CONSTRAINT "facilities_access_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "facilities_access_user_id_unique"
  ON "facilities_access" ("user_id");
--> statement-breakpoint
INSERT INTO "facilities_categories" ("name", "description", "sort_order")
VALUES
  ('Facilities Requests', 'Repairs, damage, spaces, transportation, and kitchen support.', 0),
  ('Comms Requests', 'Communication, promotion, design, and messaging requests.', 1),
  ('Building / IT Requests', 'Building systems, devices, accounts, and technical support.', 2),
  ('Production Requests', 'Audio, video, lighting, staging, and production support.', 3)
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "facilities_requests"
  ("category_id", "eyebrow", "title", "description", "use_when", "url", "button_label", "icon", "sort_order")
SELECT c."id", 'Repairs & Maintenance', 'Maintenance & Repair Request',
  'Building-related repairs, upkeep, or a change to a room. Submit at least 2 weeks ahead when you can.',
  'something needs fixing from normal wear, like a flickering light, a sticky lock, or a leaky faucet.',
  'https://wkf.ms/45vA1rc', 'Open form →', 'wrench', 0
FROM "facilities_categories" c
WHERE c."name" = 'Facilities Requests'
  AND NOT EXISTS (SELECT 1 FROM "facilities_requests" r WHERE r."title" = 'Maintenance & Repair Request');
--> statement-breakpoint
INSERT INTO "facilities_requests"
  ("category_id", "eyebrow", "title", "description", "use_when", "url", "button_label", "icon", "sort_order")
SELECT c."id", 'Sudden Damage', 'Facilities Damage Report',
  'Report damage to property, equipment, or a space, with location, severity, and photos.',
  'something broke or was damaged suddenly, like an accident, a storm, or a break-in.',
  'https://wkf.ms/4jhAVhv', 'Open form →', 'alert-triangle', 1
FROM "facilities_categories" c
WHERE c."name" = 'Facilities Requests'
  AND NOT EXISTS (SELECT 1 FROM "facilities_requests" r WHERE r."title" = 'Facilities Damage Report');
--> statement-breakpoint
INSERT INTO "facilities_requests"
  ("category_id", "eyebrow", "title", "description", "use_when", "url", "button_label", "icon", "sort_order")
SELECT c."id", 'Room & Space', 'Room & Space Booking',
  'Book a room, request setup, food, or AV support for a meeting or event.',
  'you need a space reserved, at either location.',
  'https://forms.monday.com/forms/d1c111ec3c4976c3b8cb6a20bee3a5b5?r=use1', 'Open form →', 'building', 2
FROM "facilities_categories" c
WHERE c."name" = 'Facilities Requests'
  AND NOT EXISTS (SELECT 1 FROM "facilities_requests" r WHERE r."title" = 'Room & Space Booking');
--> statement-breakpoint
INSERT INTO "facilities_requests"
  ("category_id", "eyebrow", "title", "description", "use_when", "url", "button_label", "icon", "sort_order")
SELECT c."id", 'Between Locations', 'Transportation Request',
  'Move equipment, supplies, or materials between Transform Church and The Williams Center. Submit 3 weeks ahead.',
  'something needs to physically travel between locations for an event.',
  'https://wkf.ms/4fuz6vA', 'Open form →', 'truck', 3
FROM "facilities_categories" c
WHERE c."name" = 'Facilities Requests'
  AND NOT EXISTS (SELECT 1 FROM "facilities_requests" r WHERE r."title" = 'Transportation Request');
--> statement-breakpoint
INSERT INTO "facilities_requests"
  ("category_id", "eyebrow", "title", "description", "use_when", "url", "button_label", "icon", "sort_order")
SELECT c."id", 'Office Kitchen', 'Kitchen Request',
  'New supplies, restocks, or equipment concerns for the staff kitchen.',
  'the staff kitchen is low on something or needs attention.',
  'https://wkf.ms/47ptte1', 'Open form →', 'coffee', 4
FROM "facilities_categories" c
WHERE c."name" = 'Facilities Requests'
  AND NOT EXISTS (SELECT 1 FROM "facilities_requests" r WHERE r."title" = 'Kitchen Request');