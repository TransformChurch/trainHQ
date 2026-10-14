import { boolean, date, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Local copy of Planning Center People profiles, refreshed by the weekly
// people sync (routes/peopleSync.ts) so reports can answer "who" questions
// (baptized? which campus? what grade?) without calling Planning Center for
// every report. Attendance tables store only the Planning Center person id;
// join them to this table on person_id.
//
// The basics below are always pulled. Anything else an admin picks in the
// "Planning Center people sync" card (built-in profile fields and custom
// fields) lands in `fields`, keyed by a stable key ("attr:anniversary",
// "field:123456") -- so adding or removing a column is a settings change,
// not a database migration. A few church-standard custom fields (Baptized?,
// Thrive, Last Served) are always included, matched by name.
// Emails, phones, street addresses and medical notes are deliberately not
// pulled.
//
// removed_at is set when a full pull no longer sees the person (deleted or
// merged in Planning Center); it clears again if they reappear.
export const peopleProfilesTable = pgTable("people_profiles", {
  personId: text("person_id").primaryKey(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  birthdate: date("birthdate"),
  gender: text("gender"),
  grade: integer("grade"),
  child: boolean("child"),
  membership: text("membership"),
  status: text("status"),
  campusId: text("campus_id"),
  campusName: text("campus_name"),
  // From the primary address -- city/state/zip only, never the street.
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  pcoCreatedAt: timestamp("pco_created_at"),
  pcoUpdatedAt: timestamp("pco_updated_at"),
  fields: jsonb("fields").$type<Record<string, string | string[] | number | boolean | null>>().notNull().default({}),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
  removedAt: timestamp("removed_at"),
}, (table) => [
  index("people_profiles_last_name_idx").on(table.lastName),
  index("people_profiles_campus_idx").on(table.campusId),
]);

export type PeopleProfile = typeof peopleProfilesTable.$inferSelect;
