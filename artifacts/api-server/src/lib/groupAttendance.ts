// How Planning Center Groups attendance is counted, shared by the Weekly
// Pulse (routes/weeklyPulse.ts) and the group history pull
// (routes/groupHistory.ts) so both report the same number.
//
// GET /groups/v2/events/{id}/attendances returns one record per roster
// member for that meeting, each with an `attended` flag -- absent members are
// included. So the count is unique people NOT marked absent (a record with no
// `attended` attribute counts as present). No records at all means the
// leader didn't take attendance: attendees is null, which callers show as
// "not taken" rather than 0.
type AttendanceRecord = {
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string } | null } | undefined>;
};

export function summarizeGroupAttendance(records: AttendanceRecord[]): { attendees: number | null; attendanceRecords: number } {
  if (!records.length) return { attendees: null, attendanceRecords: 0 };
  const present = new Set<string>();
  let anonymousPresent = 0;
  for (const record of records) {
    if (record.attributes?.attended === false) continue;
    const person = record.relationships?.person?.data?.id;
    if (typeof person === "string" && person) present.add(person);
    else anonymousPresent += 1;
  }
  return { attendees: present.size + anonymousPresent, attendanceRecords: records.length };
}
