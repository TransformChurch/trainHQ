import { useEffect, useMemo, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { BarChart3, Check, ChevronDown, ChevronUp, Download, FileSpreadsheet, Loader2, Plus, RefreshCw, Settings2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? import.meta.env.BASE_URL.replace(/\/$/, "");
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type EventOption = { id: string; name: string; frequency: string };
type ReportFieldKey = string;
type AvailableField = { key: ReportFieldKey; label: string };
type CleanupMode = "month_quarter" | "all_dates";
type ReportTemplate = {
  id: number;
  name: string;
  originalFileName: string;
  createdAt: string;
  pullFields: ReportFieldKey[];
  sessionCount: number;
  cleanupMode: CleanupMode;
};
type PreparedRun = {
  runId: string;
  eventName: string;
  rawRows: number;
  peopleCount: number;
  serviceDates: string[];
  sessionCount: number;
  pullFields: ReportFieldKey[];
  pullFieldLabels: string[];
  reviewCount: number;
  flags: string;
  expiresAt: string;
};

const FIELD_OPTIONS: AvailableField[] = [
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

async function api(path: string, options?: RequestInit): Promise<Response> {
  const token = sessionStorage.getItem("auth_bearer_token");
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed." }));
    throw new Error(body.error || "Request failed.");
  }
  return response;
}

function defaultDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function StepNumber({ number, active, complete }: { number: number; active: boolean; complete: boolean }) {
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
      complete ? "border-primary bg-primary text-primary-foreground" :
      active ? "border-primary text-primary" : "border-muted-foreground/30 text-muted-foreground"
    }`}>
      {complete ? <Check className="h-4 w-4" /> : number}
    </div>
  );
}

export default function Reporting() {
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "admin";
  const [events, setEvents] = useState<EventOption[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [eventId, setEventId] = useState("");
  const [endDate, setEndDate] = useState(defaultDate(0));
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [prepared, setPrepared] = useState<PreparedRun | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [generating, setGenerating] = useState<"xlsx" | "pdf" | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [draftFields, setDraftFields] = useState<ReportFieldKey[]>(["planning_center_id"]);
  const [draftSessionCount, setDraftSessionCount] = useState(5);
  const [draftTemplateName, setDraftTemplateName] = useState("");
  const [draftCleanupMode, setDraftCleanupMode] = useState<CleanupMode>("month_quarter");
  const [savingSettings, setSavingSettings] = useState(false);
  const [planningCenterFields, setPlanningCenterFields] = useState<AvailableField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState("");
  const [fieldToAdd, setFieldToAdd] = useState("");

  const fieldOptions = useMemo(
    () => [...FIELD_OPTIONS, ...planningCenterFields],
    [planningCenterFields],
  );
  const fieldByKey = useMemo(
    () => new Map(fieldOptions.map((field) => [field.key, field])),
    [fieldOptions],
  );

  const reconnectUrl = useMemo(() => {
    const returnTo = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/reporting`;
    return `${BASE}/api/auth/planning-center/start?return_to=${encodeURIComponent(returnTo)}`;
  }, []);

  const loadTemplates = async () => {
    const response = await api("/api/reports/templates");
    const rows = await response.json() as ReportTemplate[];
    setTemplates(rows);
    setSelectedTemplate((current) =>
      current && rows.some((template) => String(template.id) === current)
        ? current
        : (rows[0]?.id ? String(rows[0].id) : ""),
    );
  };

  const loadEvents = async () => {
    setEventsLoading(true);
    setEventsError("");
    try {
      const response = await api("/api/reports/events");
      const rows = await response.json() as EventOption[];
      setEvents(rows);
      setEventId((current) => current || rows[0]?.id || "");
    } catch (error) {
      setEventsError(error instanceof Error ? error.message : "Could not load events.");
    } finally {
      setEventsLoading(false);
    }
  };

  const loadPlanningCenterFields = async () => {
    setFieldsLoading(true);
    setFieldsError("");
    try {
      const response = await api("/api/reports/fields");
      const result = await response.json() as { planningCenterFields: AvailableField[] };
      setPlanningCenterFields(result.planningCenterFields);
    } catch (error) {
      setFieldsError(error instanceof Error ? error.message : "Could not load Planning Center fields.");
    } finally {
      setFieldsLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
    loadTemplates().catch((error) => {
      toast({ title: "Could not load report templates", description: error.message, variant: "destructive" });
    });
  }, []);

  useEffect(() => {
    if (isAdmin) loadPlanningCenterFields();
  }, [isAdmin]);

  const { uploadFile, isUploading } = useUpload({
    basePath: `${BASE}/api/storage`,
    getAuthToken: () => sessionStorage.getItem("auth_bearer_token"),
  });

  const prepare = async () => {
    if (!eventId || !endDate || !selectedTemplate) return;
    setPreparing(true);
    setPrepared(null);
    try {
      const response = await api("/api/reports/prepare", {
        method: "POST",
        body: JSON.stringify({ eventId, endDate, templateId: Number(selectedTemplate) }),
      });
      const result = await response.json() as PreparedRun;
      setPrepared(result);
      toast({ title: "Attendance data cleaned", description: `${result.peopleCount} people are ready for the report.` });
    } catch (error) {
      toast({ title: "Could not prepare report", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setPreparing(false);
    }
  };

  const downloadCsv = async () => {
    if (!prepared) return;
    try {
      const response = await api(`/api/reports/runs/${prepared.runId}/data.csv`);
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? "attendance-report.csv";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Could not download CSV", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    }
  };

  const download = async (format: "xlsx" | "pdf") => {
    if (!prepared || !selectedTemplate) return;
    setGenerating(format);
    try {
      const response = await api("/api/reports/generate", {
        method: "POST",
        body: JSON.stringify({ runId: prepared.runId, templateId: Number(selectedTemplate), format }),
      });
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? `attendance-report.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ title: `${format.toUpperCase()} report downloaded` });
    } catch (error) {
      toast({ title: "Could not generate report", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  const addTemplate = async () => {
    if (!templateName.trim() || !templateFile) return;
    setSavingTemplate(true);
    try {
      const normalizedFile = templateFile.type === XLSX_TYPE
        ? templateFile
        : new File([templateFile], templateFile.name, { type: XLSX_TYPE });
      const uploaded = await uploadFile(normalizedFile);
      if (!uploaded) throw new Error("The template upload failed.");
      await api("/api/reports/templates", {
        method: "POST",
        body: JSON.stringify({
          name: templateName.trim(),
          originalFileName: templateFile.name,
          objectPath: uploaded.objectPath,
        }),
      });
      setTemplateName("");
      setTemplateFile(null);
      await loadTemplates();
      toast({ title: "Report template added" });
    } catch (error) {
      toast({ title: "Could not add template", description: error instanceof Error ? error.message : "Upload failed.", variant: "destructive" });
    } finally {
      setSavingTemplate(false);
    }
  };

  const removeTemplate = async (template: ReportTemplate) => {
    if (!window.confirm(`Delete the "${template.name}" report template?`)) return;
    try {
      await api(`/api/reports/templates/${template.id}`, { method: "DELETE" });
      await loadTemplates();
      toast({ title: "Report template deleted" });
    } catch (error) {
      toast({ title: "Could not delete template", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    }
  };

  const editTemplateSettings = (template: ReportTemplate) => {
    setEditingTemplateId((current) => current === template.id ? null : template.id);
    setDraftFields([
      "planning_center_id",
      ...template.pullFields.filter((field) => field !== "planning_center_id"),
    ]);
    setDraftSessionCount(template.sessionCount);
    setDraftTemplateName(template.name);
    setDraftCleanupMode(template.cleanupMode);
  };

  const toggleField = (key: ReportFieldKey, enabled: boolean) => {
    if (key === "planning_center_id") return;
    setDraftFields((current) => enabled
      ? [...current, key]
      : current.filter((field) => field !== key));
  };

  const addPlanningCenterField = () => {
    if (!fieldToAdd) return;
    setDraftFields((current) => current.includes(fieldToAdd) ? current : [...current, fieldToAdd]);
    setFieldToAdd("");
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (index <= 0 || target <= 0 || target >= draftFields.length) return;
    setDraftFields((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const saveTemplateSettings = async (templateId: number) => {
    setSavingSettings(true);
    try {
      await api(`/api/reports/templates/${templateId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          name: draftTemplateName.trim(),
          pullFields: draftFields,
          sessionCount: draftSessionCount,
          cleanupMode: draftCleanupMode,
        }),
      });
      await loadTemplates();
      setPrepared(null);
      setEditingTemplateId(null);
      toast({ title: "Template settings saved" });
    } catch (error) {
      toast({ title: "Could not save template settings", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          <BarChart3 className="h-8 w-8 text-primary" /> Reporting
        </h1>
        <p className="mt-2 text-muted-foreground">
          Export Planning Center Check-Ins attendance into an approved report template.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <StepNumber number={1} active={!prepared} complete={!!prepared} />
            Select attendance cutoff
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="report-event">Active event</Label>
            <select
              id="report-event"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={eventId}
              onChange={(event) => { setEventId(event.target.value); setPrepared(null); }}
              disabled={eventsLoading || !!eventsError}
            >
              {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-end">End date</Label>
            <Input id="report-end" type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPrepared(null); }} />
            <p className="text-xs text-muted-foreground">
              The selected template determines how many previous Planning Center sessions are included.
            </p>
          </div>
          {eventsLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground md:col-span-3"><Loader2 className="h-4 w-4 animate-spin" /> Loading Planning Center events…</p>}
          {eventsError && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 md:col-span-3">
              <p className="font-medium">Check-Ins access is required</p>
              <p className="mt-1">{eventsError}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => window.location.assign(reconnectUrl)}>Reconnect Church Center</Button>
                <Button size="sm" variant="outline" onClick={loadEvents}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <StepNumber number={2} active={!!eventId && !selectedTemplate} complete={!!selectedTemplate} />
            Select template
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-lg space-y-2">
            <Label htmlFor="report-template">Excel template</Label>
            <select
              id="report-template"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedTemplate}
              onChange={(event) => { setSelectedTemplate(event.target.value); setPrepared(null); }}
            >
              {!templates.length && <option value="">No templates available</option>}
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </div>
          {selectedTemplate && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <span className="font-medium">CSV column order: </span>
              {templates.find((template) => String(template.id) === selectedTemplate)?.pullFields
                .map((key) => fieldByKey.get(key)?.label ?? key)
                .filter(Boolean)
                .join(" → ")}
              <span className="mt-1 block text-muted-foreground">
                Sessions: {templates.find((template) => String(template.id) === selectedTemplate)?.sessionCount ?? 5}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <StepNumber number={3} active={!!selectedTemplate} complete={!!prepared} />
            Pull, review, and download
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pull the fields configured for this template, merge duplicate check-ins, and format the CSV in the saved column order.
          </p>
          <Button onClick={prepare} disabled={preparing || !eventId || !selectedTemplate || !!eventsError}>
            {preparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {preparing ? "Pulling and formatting data…" : "Pull and prepare data"}
          </Button>
          {prepared && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div className="grid gap-3 text-sm sm:grid-cols-4">
                <div><span className="block text-muted-foreground">Event</span><strong>{prepared.eventName}</strong></div>
                <div><span className="block text-muted-foreground">People</span><strong>{prepared.peopleCount}</strong></div>
                <div><span className="block text-muted-foreground">Check-ins</span><strong>{prepared.rawRows}</strong></div>
                <div><span className="block text-muted-foreground">Review flags</span><strong>{prepared.reviewCount}</strong></div>
              </div>
              <p className="text-xs text-muted-foreground">Fields: {prepared.pullFieldLabels.join(" → ")}</p>
              <p className="text-xs text-muted-foreground">
                Sessions ({prepared.sessionCount}): {prepared.serviceDates.join(", ")}
              </p>
              {prepared.reviewCount > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Review cleanup flags</summary>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs">{prepared.flags}</pre>
                </details>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={downloadCsv} disabled={!prepared}>
              <Download className="mr-2 h-4 w-4" /> Download CSV
            </Button>
            <Button onClick={() => download("xlsx")} disabled={!prepared || !selectedTemplate || !!generating}>
              {generating === "xlsx" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
              Download XLSX
            </Button>
            <Button variant="outline" onClick={() => download("pdf")} disabled={!prepared || !selectedTemplate || !!generating}>
              {generating === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Manage templates</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="template-name">Template name</Label>
                <Input id="template-name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Monthly Youth Report" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-file">XLSX file</Label>
                <Input id="template-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setTemplateFile(event.target.files?.[0] ?? null)} />
              </div>
              <Button onClick={addTemplate} disabled={!templateName.trim() || !templateFile || savingTemplate || isUploading}>
                {(savingTemplate || isUploading) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Add
              </Button>
            </div>
            <div className="divide-y rounded-lg border">
              {!templates.length && <p className="p-4 text-sm text-muted-foreground">No report templates have been added.</p>}
              {templates.map((template) => (
                <div key={template.id} className="p-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">{template.name}</p>
                      <p className="text-xs text-muted-foreground">{template.originalFileName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {template.pullFields.length} profile fields · {template.sessionCount} sessions
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => editTemplateSettings(template)}>
                        <Settings2 className="mr-2 h-4 w-4" /> Settings
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => removeTemplate(template)} aria-label={`Delete ${template.name}`}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {editingTemplateId === template.id && (
                    <div className="mt-4 space-y-4 rounded-lg border bg-muted/20 p-4">
                      <div>
                        <p className="font-medium">Template report settings</p>
                        <p className="text-xs text-muted-foreground">
                          Checked fields are exported in the order shown. Planning Center ID is always the first column.
                        </p>
                      </div>
                      <div className="max-w-lg space-y-2">
                        <Label htmlFor={`template-display-name-${template.id}`}>Template name</Label>
                        <Input
                          id={`template-display-name-${template.id}`}
                          value={draftTemplateName}
                          onChange={(event) => setDraftTemplateName(event.target.value)}
                        />
                      </div>
                      <div className="max-w-xs space-y-2">
                        <Label htmlFor={`cleanup-mode-${template.id}`}>Cleanup format</Label>
                        <select
                          id={`cleanup-mode-${template.id}`}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={draftCleanupMode}
                          onChange={(event) => setDraftCleanupMode(event.target.value as CleanupMode)}
                        >
                          <option value="month_quarter">Quarter/Monthly</option>
                          <option value="all_dates">All Dates</option>
                        </select>
                      </div>
                      <div className="max-w-xs space-y-2">
                        <Label htmlFor={`session-count-${template.id}`}>Previous sessions to include</Label>
                        <Input
                          id={`session-count-${template.id}`}
                          type="number"
                          min={1}
                          max={52}
                          value={draftSessionCount}
                          onChange={(event) => setDraftSessionCount(Number(event.target.value))}
                        />
                        <p className="text-xs text-muted-foreground">
                          Counts backward from the report end date. New templates default to 5 sessions.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`add-field-${template.id}`}>Add field</Label>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <select
                            id={`add-field-${template.id}`}
                            className="flex h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={fieldToAdd}
                            disabled={fieldsLoading}
                            onChange={(event) => setFieldToAdd(event.target.value)}
                          >
                            <option value="">{fieldsLoading ? "Loading Planning Center fields…" : "Select a Planning Center field"}</option>
                            {planningCenterFields
                              .filter((field) => !draftFields.includes(field.key))
                              .map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
                          </select>
                          <Button type="button" variant="outline" onClick={addPlanningCenterField} disabled={!fieldToAdd || fieldsLoading}>
                            <Plus className="mr-2 h-4 w-4" /> Add field
                          </Button>
                        </div>
                        {fieldsError && (
                          <div className="flex items-center gap-2 text-sm text-destructive">
                            <span>{fieldsError}</span>
                            <Button type="button" size="sm" variant="outline" onClick={loadPlanningCenterFields}>Try again</Button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        {[
                          ...draftFields.map((key) => fieldByKey.get(key) ?? { key, label: `Unavailable Planning Center field (${key})` }),
                          ...FIELD_OPTIONS.filter((field) => !draftFields.includes(field.key)),
                        ].map((field) => {
                          const checked = draftFields.includes(field.key);
                          const orderIndex = draftFields.indexOf(field.key);
                          return (
                            <div key={field.key} className={`flex items-center gap-3 rounded-md border p-2 ${checked ? "bg-background" : "opacity-65"}`}>
                              <input
                                id={`template-${template.id}-${field.key}`}
                                type="checkbox"
                                className="h-4 w-4 rounded border-input"
                                checked={checked}
                                disabled={field.key === "planning_center_id"}
                                onChange={(event) => toggleField(field.key, event.target.checked)}
                              />
                              <Label htmlFor={`template-${template.id}-${field.key}`} className="flex-1 cursor-pointer">
                                {checked && <span className="mr-2 text-xs text-muted-foreground">{orderIndex + 1}.</span>}
                                {field.label}
                                {field.key === "planning_center_id" && <span className="ml-2 text-xs text-muted-foreground">(required)</span>}
                              </Label>
                              {checked && field.key !== "planning_center_id" && (
                                <div className="flex gap-1">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    disabled={orderIndex <= 1}
                                    onClick={() => moveField(orderIndex, -1)}
                                    aria-label={`Move ${field.label} up`}
                                  >
                                    <ChevronUp className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    disabled={orderIndex === draftFields.length - 1}
                                    onClick={() => moveField(orderIndex, 1)}
                                    aria-label={`Move ${field.label} down`}
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => saveTemplateSettings(template.id)}
                          disabled={savingSettings || !draftTemplateName.trim() || !Number.isInteger(draftSessionCount) || draftSessionCount < 1 || draftSessionCount > 52}
                        >
                          {savingSettings && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save settings
                        </Button>
                        <Button variant="ghost" onClick={() => setEditingTemplateId(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}