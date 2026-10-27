import { boolean, date, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// Engagement dashboard (2026-10-27): who attended each tracked item, week by
// week, so the dashboard can count unique people over any number of weeks
// and score their engagement (lib/engagement.ts, routes/engagement.ts).
// Filled only for the Check-Ins events / groups / group types an admin picks
// in the "Engagement dashboard" card, by the Monday 6 AM Eastern sync.
// Planning Center person ids only -- names and everything else stay in
// people_profiles.
//
// item_kind: "checkins_event" | "group" | "group_type"; item_id: the
// Planning Center event / group / group type id. Weeks are Monday starts,
// same boundaries as the other attendance trackers.

// One row per item per week that had sessions/meetings.
export const engagementWeeksTable = pgTable("engagement_weeks", {
  itemKind: text("item_kind").notNull(),
  itemId: text("item_id").notNull(),
  weekStart: date("week_start").notNull(),
  sessions: integer("sessions").notNull(), // check-ins sessions or group meetings that week
  attendees: integer("attendees"), // unique people present; null = groups attendance not taken
  roster: integer("roster"), // groups only: unique people on that week's attendance lists
  firstTimers: integer("first_timers").notNull().default(0),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.itemKind, table.itemId, table.weekStart] }),
  index("engagement_weeks_week_start_idx").on(table.weekStart),
]);

// One row per person present for an item in a week.
export const engagementAttendanceTable = pgTable("engagement_attendance", {
  itemKind: text("item_kind").notNull(),
  itemId: text("item_id").notNull(),
  weekStart: date("week_start").notNull(),
  personId: text("person_id").notNull(),
  firstTime: boolean("first_time").notNull().default(false),
}, (table) => [
  primaryKey({ columns: [table.itemKind, table.itemId, table.weekStart, table.personId] }),
  index("engagement_attendance_person_idx").on(table.personId),
]);

export type EngagementWeek = typeof engagementWeeksTable.$inferSelect;
export type EngagementAttendance = typeof engagementAttendanceTable.$inferSelect;
