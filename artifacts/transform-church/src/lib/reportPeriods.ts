// Calendar report periods for the Reporting page -- same rules as the API's
// lib/reportPeriods.ts (previous month / quarter, Monday-Sunday weeks), using
// the browser's local date.
export type ReportPeriodKind = "week" | "month" | "quarter";

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function previousPeriod(kind: ReportPeriodKind, today: string): { startDate: string; endDate: string; label: string } {
  const [year, month, day] = today.split("-").map(Number);
  if (kind === "month") {
    const start = utcDate(year, month - 2, 1);
    return { startDate: ymd(start), endDate: ymd(utcDate(year, month - 1, 0)), label: `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}` };
  }
  if (kind === "quarter") {
    const thisQuarterStartMonth = Math.floor((month - 1) / 3) * 3;
    const start = utcDate(year, thisQuarterStartMonth - 3, 1);
    return {
      startDate: ymd(start),
      endDate: ymd(utcDate(year, thisQuarterStartMonth, 0)),
      label: `Q${Math.floor(start.getUTCMonth() / 3) + 1} ${start.getUTCFullYear()}`,
    };
  }
  const todayDate = utcDate(year, month - 1, day);
  const thisMonday = utcDate(year, month - 1, day - ((todayDate.getUTCDay() + 6) % 7));
  const start = utcDate(thisMonday.getUTCFullYear(), thisMonday.getUTCMonth(), thisMonday.getUTCDate() - 7);
  const end = utcDate(thisMonday.getUTCFullYear(), thisMonday.getUTCMonth(), thisMonday.getUTCDate() - 1);
  return { startDate: ymd(start), endDate: ymd(end), label: `Week of ${ymd(start)}` };
}

export function defaultPeriodKind(engine: string | null | undefined): "month" | "quarter" {
  return (engine ?? "").includes("quarterly") ? "quarter" : "month";
}

export function formatRange(startDate: string, endDate: string): string {
  const format = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${format(startDate)} – ${format(endDate)}`;
}
