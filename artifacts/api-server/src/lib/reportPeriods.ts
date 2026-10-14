// Calendar report periods (2026-10-14): "previous month / quarter / week"
// date ranges, worked out in the church's time zone so a run at 8 AM Eastern
// on the 1st always covers the period that just ended. Used by the Reporting
// page defaults (via GET /api/reports/periods) and scheduled reports. Weeks
// run Monday-Sunday, matching the attendance trackers.
export type ReportPeriodKind = "week" | "month" | "quarter";
export type ReportPeriod = { kind: ReportPeriodKind; startDate: string; endDate: string; label: string };

export const CHURCH_TIME_ZONE = "America/New_York";

// Today's date (YYYY-MM-DD) in the church's time zone.
export function churchToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CHURCH_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The most recent complete period before `today` (YYYY-MM-DD).
export function previousPeriod(kind: ReportPeriodKind, today: string): ReportPeriod {
  const [year, month, day] = today.split("-").map(Number);
  if (kind === "month") {
    const start = utcDate(year, month - 2, 1);
    const end = utcDate(year, month - 1, 0);
    return { kind, startDate: ymd(start), endDate: ymd(end), label: `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}` };
  }
  if (kind === "quarter") {
    const thisQuarterStartMonth = Math.floor((month - 1) / 3) * 3; // 0-based
    const start = utcDate(year, thisQuarterStartMonth - 3, 1);
    const end = utcDate(year, thisQuarterStartMonth, 0);
    const quarter = Math.floor(start.getUTCMonth() / 3) + 1;
    return { kind, startDate: ymd(start), endDate: ymd(end), label: `Q${quarter} ${start.getUTCFullYear()}` };
  }
  const todayDate = utcDate(year, month - 1, day);
  const daysSinceMonday = (todayDate.getUTCDay() + 6) % 7;
  const thisMonday = utcDate(year, month - 1, day - daysSinceMonday);
  const start = utcDate(thisMonday.getUTCFullYear(), thisMonday.getUTCMonth(), thisMonday.getUTCDate() - 7);
  const end = utcDate(thisMonday.getUTCFullYear(), thisMonday.getUTCMonth(), thisMonday.getUTCDate() - 1);
  return { kind, startDate: ymd(start), endDate: ymd(end), label: `Week of ${ymd(start)}` };
}

// Which period a template's report naturally covers: quarterly engines a
// quarter, everything else a month.
export function defaultPeriodKind(engine: string | null | undefined): ReportPeriodKind {
  return (engine ?? "").includes("quarterly") ? "quarter" : "month";
}

// Which schedules are due on `today`: weekly every Monday, monthly on the
// 1st, quarterly on Jan/Apr/Jul/Oct 1.
export function dueFrequencies(today: string): ReportPeriodKind[] {
  const [year, month, day] = today.split("-").map(Number);
  const due: ReportPeriodKind[] = [];
  if (utcDate(year, month - 1, day).getUTCDay() === 1) due.push("week");
  if (day === 1) due.push("month");
  if (day === 1 && (month - 1) % 3 === 0) due.push("quarter");
  return due;
}
