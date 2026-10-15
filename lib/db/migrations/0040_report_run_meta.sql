-- Season reports (2026-10-15): a prepared run can carry extra details the
-- cleaned CSV can't (season name, night names, Check-Ins vs Groups source),
-- stored as JSON text. Additive only: one nullable column.
ALTER TABLE "report_runs" ADD COLUMN IF NOT EXISTS "meta" text;
