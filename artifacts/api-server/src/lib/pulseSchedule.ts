// Weekly Pulse send times (2026-10-18): each Pulse config can go out at any
// number of weekday + time slots in US Eastern time (lib/jobSchedule.ts).
//
// Stored in the settings table (key below, { "<configId>": [sendTimes] }) so
// no migration was needed. A config with nothing saved uses the original
// Monday 7:00 AM. Whenever a config or its send times change, the union of
// every enabled Pulse's send times is published to R2 (PULSE_SCHEDULE_KEY),
// which the Worker reads every 15 minutes to decide when to wake the API.
import { db, settingsTable, weeklyPulseConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import {
  DEFAULT_PULSE_SEND_TIMES,
  normalizeSendTimes,
  PULSE_SCHEDULE_KEY,
  sendTimeKey,
  type PulseSendTime,
} from "./jobSchedule";

const SETTINGS_KEY = "weekly_pulse_send_times";

export async function readAllSendTimes(): Promise<Record<string, PulseSendTime[]>> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, SETTINGS_KEY)).limit(1);
  try {
    const parsed = rows[0] ? JSON.parse(rows[0].value) as Record<string, unknown> : {};
    const result: Record<string, PulseSendTime[]> = {};
    for (const [id, times] of Object.entries(parsed)) result[id] = normalizeSendTimes(times);
    return result;
  } catch {
    return {};
  }
}

export function sendTimesFor(configId: number, all: Record<string, PulseSendTime[]>): PulseSendTime[] {
  const saved = all[String(configId)];
  return saved && saved.length ? saved : DEFAULT_PULSE_SEND_TIMES;
}

export async function saveSendTimes(configId: number, times: PulseSendTime[] | null): Promise<void> {
  const all = await readAllSendTimes();
  if (times && times.length) all[String(configId)] = times;
  else delete all[String(configId)];
  const value = JSON.stringify(all);
  await db.insert(settingsTable).values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

// Every distinct send time of every enabled Pulse.
export async function activePulseSendTimes(): Promise<PulseSendTime[]> {
  const configs = await db.select({ id: weeklyPulseConfigTable.id }).from(weeklyPulseConfigTable)
    .where(eq(weeklyPulseConfigTable.enabled, true));
  const all = await readAllSendTimes();
  const seen = new Map<string, PulseSendTime>();
  for (const config of configs) {
    for (const time of sendTimesFor(config.id, all)) seen.set(sendTimeKey(time), time);
  }
  return normalizeSendTimes([...seen.values()]);
}

// Writes the Worker's copy of the schedule to R2. Best-effort: if it fails,
// the Worker keeps using the previous file (or Monday 7:00 AM if none).
export async function publishPulseSchedule(): Promise<{ published: boolean; slots: string[] }> {
  const slots = (await activePulseSendTimes()).map(sendTimeKey);
  if (process.env.STORAGE_BACKEND !== "r2") return { published: false, slots };
  try {
    const host = process.env.STORAGE_R2_HOST || "objects.internal";
    const url = `http://${host}/${PULSE_SCHEDULE_KEY.split("/").map(encodeURIComponent).join("/")}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slots, updatedAt: new Date().toISOString() }),
    });
    if (!response.ok) throw new Error(`Storage returned ${response.status}`);
    return { published: true, slots };
  } catch (error) {
    logger.error({ err: error }, "Failed to publish the Weekly Pulse schedule");
    return { published: false, slots };
  }
}
