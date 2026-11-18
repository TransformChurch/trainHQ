// Which cleanup-script options a report run gets (routes/reports.ts
// savePreparedRun). Kept free of DB/network code so it can be unit-tested.
//
// TC Kids engines (report_kids.py) work out grade groups from Birthdate with
// each campus's CampusConfig and never read the Grade column. The cleanup
// scripts' 6th-grade floor (LOWEST_GRADE_BUCKET) is right for Youth but would
// recode every Pre-K-5th grader to "6th Grade" and flag them all, so Kids
// runs pass --no-grade-floor (Andrew, 2026-11-18). Youth and season engines
// get no extra options, exactly as before.

export const KIDS_ENGINES = [
  "kids_rutherford",
  "kids_lyndhurst",
  "kids_rutherford_quarterly",
  "kids_lyndhurst_quarterly",
] as const;

export const NO_GRADE_FLOOR_FLAG = "--no-grade-floor";

const kidsEngines: ReadonlySet<string> = new Set(KIDS_ENGINES);

export function isKidsEngine(engine: string | null | undefined): boolean {
  return !!engine && kidsEngines.has(engine);
}

// scriptSource is the cleanup script's text. An admin can upload their own
// cleanup script (Reporting > scripts); an older one that doesn't know the
// flag would exit with an argparse error, so the flag is only passed when the
// script mentions it -- such a script just keeps the old grade-floor
// behavior instead of failing the run.
export function cleanupScriptArgs(engine: string | null | undefined, scriptSource: string): string[] {
  if (!isKidsEngine(engine)) return [];
  return scriptSource.includes(NO_GRADE_FLOOR_FLAG) ? [NO_GRADE_FLOOR_FLAG] : [];
}
