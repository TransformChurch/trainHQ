// Pure logic for scheduled reports (routes/scheduledReports.ts): what a
// schedule looks like, validation, which schedules are due on a date, and
// when each runs next. Kept free of DB/network code for unit tests.
import { dueFrequencies, previousPeriod, type ReportPeriod, type ReportPeriodKind } from "./reportPeriods";

export type ScheduleFrequency = ReportPeriodKind; // "week" | "month" | "quarter"

export type ScheduleRunRecord = {
  at: string;
  trigger: "scheduled" | "manual";
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  status: "running" | "sent" | "error";
  error?: string;
  peopleCount?: number;
  sessionCount?: number;
};

export type ReportSchedule = {
  id: string;
  name: string;
  templateId: number;
  eventIds: string[];
  eventNames: string[];
  recipients: string[];
  frequency: ScheduleFrequency;
  enabled: boolean;
  // Adds the "Where our ... live" map page (2026-10-21). Missing on
  // schedules saved before then, which reads as off.
  includeMap?: boolean;
  // Whose Planning Center connection prepares the report (the admin who
  // created or last saved the schedule).
  ownerUserId: string;
  ownerName: string;
  createdAt: string;
  lastRun: ScheduleRunRecord | null;
};

const FREQUENCIES: ScheduleFrequency[] = ["week", "month", "quarter"];
export const MAX_SCHEDULES = 50;
export const SCHEDULE_HOUR_EASTERN = 8;

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanIdList(value: unknown, max: number): string[] {
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list.map((entry) => (typeof entry === "string" || typeof entry === "number" ? String(entry).trim() : "")).filter(Boolean))].slice(0, max);
}

// Validates the editable part of a schedule from the admin UI.
export function parseScheduleInput(
  body: unknown,
  parseRecipients: (raw: unknown) => { recipients: string[] } | { error: string },
): { value: Pick<ReportSchedule, "name" | "templateId" | "eventIds" | "eventNames" | "recipients" | "frequency" | "enabled" | "includeMap"> } | { error: string } {
  const source = (body ?? {}) as Record<string, unknown>;
  const name = cleanText(source.name, 120);
  if (!name) return { error: "Give the schedule a name." };
  const templateId = Number(source.templateId);
  if (!Number.isInteger(templateId) || templateId <= 0) return { error: "Pick a report template." };
  const eventIds = cleanIdList(source.eventIds, 10).filter((id) => /^\d{1,20}$/.test(id));
  if (!eventIds.length) return { error: "Pick at least one event." };
  const eventNames = cleanIdList(source.eventNames, 10).map((name) => name.slice(0, 200));
  const frequency = source.frequency as ScheduleFrequency;
  if (!FREQUENCIES.includes(frequency)) return { error: "Pick how often it runs." };
  const recipients = parseRecipients(source.recipients);
  if ("error" in recipients) return { error: recipients.error };
  return {
    value: {
      name,
      templateId,
      eventIds,
      eventNames,
      recipients: recipients.recipients,
      frequency,
      enabled: source.enabled !== false,
      includeMap: source.includeMap === true,
    },
  };
}

// Schedules due on `today`, each with the period it should cover. A schedule
// whose report for that period was already sent is skipped, so a second
// trigger firing the same morning never emails twice.
export function dueSchedules(schedules: ReportSchedule[], today: string): { schedule: ReportSchedule; period: ReportPeriod }[] {
  const due = new Set(dueFrequencies(today));
  return schedules
    .filter((schedule) => schedule.enabled && due.has(schedule.frequency))
    .map((schedule) => ({ schedule, period: previousPeriod(schedule.frequency, today) }))
    .filter(({ schedule, period }) => !(schedule.lastRun?.status === "sent" && schedule.lastRun.periodStart === period.startDate && schedule.lastRun.trigger === "scheduled"));
}

// The next date (YYYY-MM-DD) a schedule runs, strictly after `today` unless
// `includeToday` (it hasn't hit 8 AM yet).
export function nextRunDate(frequency: ScheduleFrequency, today: string, includeToday = false): string {
  const [year, month, day] = today.split("-").map(Number);
  for (let offset = includeToday ? 0 : 1; offset <= 400; offset += 1) {
    const date = new Date(Date.UTC(year, month - 1, day + offset));
    const ymd = date.toISOString().slice(0, 10);
    if (dueFrequencies(ymd).includes(frequency)) return ymd;
  }
  return "";
}
