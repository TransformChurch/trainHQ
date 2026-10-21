// When every automatic job runs, in US Eastern time (Andrew, 2026-10-18).
//
// Shared by the Cloudflare Worker (src/worker.ts imports this file) and the
// API (lib/scheduledJobs.ts, routes/weeklyPulse.ts), so both sides agree on
// the rules. Keep it free of imports: the Worker bundles it as-is.
//
// How it works: the Worker's single Cron Trigger fires every 15 minutes (in
// UTC, as Cloudflare crons always are). Each time, it converts "now" to
// Eastern time and asks dueJobs() what is due at that Eastern day/time. The
// fixed jobs below have set times; the Weekly Pulse uses the send times
// admins pick per Pulse, which the API publishes to R2 (PULSE_SCHEDULE_KEY)
// so the Worker can read them without waking the API container. Eastern
// time includes daylight saving, so a 7:00 AM job stays at 7:00 AM all year.
// (A Pulse send time between 2:00 and 2:59 AM would be skipped on the one
// spring-forward Sunday a year, when that hour doesn't exist.)

export const CHURCH_TIME_ZONE = "America/New_York";
export const TICK_MINUTES = 15;

export type FixedJobId = "people_sync" | "wiki_drive_sync" | "group_history_sync" | "checkins_history_sync" | "scheduled_reports";

// weekday: 0 = Sunday ... 6 = Saturday; null = every day.
export type EasternTime = { weekday: number | null; hour: number; minute: number };

export const FIXED_JOB_TIMES: Record<FixedJobId, EasternTime & { path: string; secret: "pulse" | "wiki" }> = {
  people_sync: { weekday: 1, hour: 1, minute: 0, path: "/api/people-sync/run-scheduled", secret: "pulse" },
  // 3:00 AM, not 2:00: on the spring-forward Sunday 2:00-2:59 AM doesn't
  // exist in Eastern time, so a 2:00 job would be skipped that day.
  wiki_drive_sync: { weekday: null, hour: 3, minute: 0, path: "/api/admin/wiki-drive-sync/run-scheduled", secret: "wiki" },
  group_history_sync: { weekday: 1, hour: 3, minute: 0, path: "/api/group-history/run-scheduled", secret: "pulse" },
  checkins_history_sync: { weekday: 1, hour: 4, minute: 0, path: "/api/attendance-history/run-scheduled", secret: "pulse" },
  scheduled_reports: { weekday: null, hour: 8, minute: 0, path: "/api/scheduled-reports/run-scheduled", secret: "pulse" },
};

export const WEEKLY_PULSE_PATH = "/api/weekly-pulse/run-scheduled";
export const PULSE_SCHEDULE_KEY = "system/weekly-pulse-schedule.json";

// One Weekly Pulse send time: a weekday and a time ("HH:MM", 24-hour,
// a multiple of 15 minutes) in Eastern time.
export type PulseSendTime = { weekday: number; time: string };

// What the Weekly Pulse did before send times existed: Monday 7:00 AM
// (it was 11:00 UTC, which is 7:00 AM Eastern in daylight saving time).
export const DEFAULT_PULSE_SEND_TIMES: PulseSendTime[] = [{ weekday: 1, time: "07:00" }];

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function easternParts(instant: Date): { ymd: string; weekday: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHURCH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    weekday,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

// The 15-minute slot a tick belongs to, e.g. "1@07:00" for Monday 7:00 AM.
// Rounded down so a slightly late tick still lands in its slot.
export function slotKey(weekday: number, hour: number, minute: number): string {
  const rounded = Math.floor(minute / TICK_MINUTES) * TICK_MINUTES;
  return `${weekday}@${String(hour).padStart(2, "0")}:${String(rounded).padStart(2, "0")}`;
}

export function sendTimeKey(sendTime: PulseSendTime): string {
  return `${sendTime.weekday}@${sendTime.time}`;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):(00|15|30|45)$/;

// Validates send times from the admin UI or storage: weekday 0-6, time on a
// 15-minute boundary; duplicates dropped; at most 21 per Pulse.
export function normalizeSendTimes(raw: unknown): PulseSendTime[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: PulseSendTime[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const weekday = Number((entry as { weekday?: unknown }).weekday);
    const time = String((entry as { time?: unknown }).time ?? "");
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !TIME_PATTERN.test(time)) continue;
    const key = `${weekday}@${time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ weekday, time });
    if (result.length >= 21) break;
  }
  return result.sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));
}

// Everything due at this instant: fixed jobs whose Eastern day/time matches,
// plus the Weekly Pulse if any published send time matches.
export function dueJobs(instant: Date, pulseSlots: string[]): { fixed: FixedJobId[]; pulseSlot: string | null } {
  const now = easternParts(instant);
  const slot = slotKey(now.weekday, now.hour, now.minute);
  const fixed = (Object.keys(FIXED_JOB_TIMES) as FixedJobId[]).filter((id) => {
    const job = FIXED_JOB_TIMES[id];
    return (job.weekday === null || job.weekday === now.weekday) && slotKey(now.weekday, job.hour, job.minute) === slot;
  });
  return { fixed, pulseSlot: pulseSlots.includes(slot) ? slot : null };
}

// The UTC instant of a wall-clock time in Eastern time on a given date
// (handles daylight saving by asking Intl for that date's offset).
export function easternToUtc(ymd: string, hour: number, minute: number): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const shown = easternParts(guess);
  const shownUtc = Date.UTC(
    Number(shown.ymd.slice(0, 4)), Number(shown.ymd.slice(5, 7)) - 1, Number(shown.ymd.slice(8, 10)), shown.hour, shown.minute,
  );
  return new Date(guess.getTime() + (guess.getTime() - shownUtc));
}

// The most recent instant at or before `now` matching one of the given
// Eastern weekly times (weekday null = daily). Used for "missed run" checks.
export function lastEasternOccurrence(times: EasternTime[], now: Date): Date | null {
  let best: Date | null = null;
  const today = easternParts(now);
  const [year, month, day] = today.ymd.split("-").map(Number);
  for (let back = 0; back <= 7; back += 1) {
    const date = new Date(Date.UTC(year, month - 1, day - back));
    const ymd = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay();
    for (const time of times) {
      if (time.weekday !== null && time.weekday !== weekday) continue;
      const candidate = easternToUtc(ymd, time.hour, time.minute);
      if (candidate.getTime() <= now.getTime() && (!best || candidate > best)) best = candidate;
    }
    if (best) return best;
  }
  return best;
}

export function formatEasternTime(hour: number, minute: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function describeSendTime(sendTime: PulseSendTime): string {
  const [hour, minute] = sendTime.time.split(":").map(Number);
  return `${WEEKDAY_NAMES[sendTime.weekday]} ${formatEasternTime(hour, minute)}`;
}
