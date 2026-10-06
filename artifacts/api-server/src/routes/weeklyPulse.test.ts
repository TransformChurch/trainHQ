import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLatestReportCsv, computeWeekRange, isStandardWeek, metricsFromResults } from "./weeklyPulse";

test("the Monday cron window counts toward the tracker; a mid-week test does not", () => {
  // Cron fires Monday 11:00 UTC.
  assert.equal(isStandardWeek(computeWeekRange(new Date("2026-10-05T11:00:00Z"))), true);
  // "Send test now" on a Sunday afternoon (like the 10/4 run).
  assert.equal(isStandardWeek(computeWeekRange(new Date("2026-10-04T18:53:43Z"))), false);
});

test("metricsFromResults stores failed fetches as null, not 0, and flattens form breakdowns", () => {
  const rows = metricsFromResults({
    checkins: [
      { sourceId: "e1", name: "Sunday Kids", count: 42 },
      { sourceId: "e2", name: "Event e2", count: 0, failed: true, warning: "PCO 500" },
    ],
    groups: [{ sourceId: "g1", name: "Youth Small Group", count: 0, warning: "endpoint unverified" }],
    forms: [{
      sourceId: "f1",
      name: "Connect Card",
      totalSubmissions: 5,
      fieldLabel: "How did you hear about us?",
      fieldBreakdown: { Friend: 2, Instagram: 3 },
    }],
  });
  assert.deepEqual(rows.map((row) => [row.sourceType, row.sourceId, row.detail, row.value]), [
    ["checkins", "e1", null, 42],
    ["checkins", "e2", null, null],
    ["group", "g1", null, 0],
    ["form", "f1", null, 5],
    ["form_field", "f1", "Instagram", 3],
    ["form_field", "f1", "Friend", 2],
  ]);
  assert.equal(rows[1].warning, "PCO 500");
  assert.equal(rows[4].fieldLabel, "How did you hear about us?");
});

test("latest report CSV escapes values and neutralises spreadsheet formulas", () => {
  const csv = buildLatestReportCsv(
    { configName: "Weekly Pulse", weekStart: "2026-09-28", weekEnd: "2026-10-05", ranAt: new Date("2026-10-05T11:00:30Z"), trigger: "scheduled" },
    [
      { sourceType: "checkins", sourceId: "e1", sourceName: "Kids, Sunday", fieldLabel: null, detail: null, value: 42, warning: null },
      { sourceType: "form_field", sourceId: "f1", sourceName: "Card", fieldLabel: "Q", detail: "=HYPERLINK(\"x\")", value: 1, warning: null },
      { sourceType: "group", sourceId: "g1", sourceName: "G", fieldLabel: null, detail: null, value: null, warning: "403" },
    ],
  );
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines[0], "Report,Week start,Week end,Ran at (UTC),Run type,Section,Source,Question,Answer,Count,Note");
  assert.equal(lines[1], 'Weekly Pulse,2026-09-28,2026-10-05,2026-10-05 11:00,Scheduled,Check-Ins,"Kids, Sunday",,,42,');
  assert.match(lines[2], /,"'=HYPERLINK\(""x""\)",1,$/);
  assert.match(lines[3], /,Groups,G,,,,Not available: 403$/);
});
