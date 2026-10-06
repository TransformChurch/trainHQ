// Built-in Planning Center report fields, shared by the Reporting page (to
// label the CSV column order) and the Tool Management page (to edit a
// template's pull fields). Custom Planning Center fields come from
// GET /api/reports/fields on top of these.
export type ReportFieldKey = string;
export type AvailableField = { key: ReportFieldKey; label: string };

export const FIELD_OPTIONS: AvailableField[] = [
  { key: "planning_center_id", label: "Planning Center ID" },
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "birthdate", label: "Birthdate" },
  { key: "email", label: "Email" },
  { key: "phone_home", label: "Phone Number (home)" },
  { key: "phone_mobile", label: "Phone Number (mobile)" },
  { key: "primary_contact_name", label: "Primary Contact Name" },
  { key: "primary_contact_email", label: "Primary Contact Email" },
  { key: "gender", label: "Gender" },
  { key: "grade", label: "Grade" },
  { key: "first_timers", label: "First Timers" },
  { key: "completed_thrive", label: "Completed Thrive" },
  { key: "baptized", label: "Baptized?" },
  { key: "last_served", label: "Last served" },
];
