import { useEffect, useMemo, useRef, useState } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { BarChart3, Check, ChevronDown, ChevronUp, Download, Loader2, Mail, Plus, RefreshCw, Send, Settings2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api, BASE } from "@/lib/toolApi";
import { FIELD_OPTIONS, type AvailableField, type ReportFieldKey } from "@/lib/reportFields";

// The admin-only setup cards for the Reporting tool, shown on the Tool
// Management page (they used to sit at the bottom of the Reporting page):
// report templates + scripts, Weekly Pulse, and the Attendance history pull.

type CleanupMode = "month_quarter" | "all_dates";
type ReportEngine = "youth_quarterly" | "youth_monthly" | "kids_rutherford" | "kids_lyndhurst" | "kids_rutherford_quarterly" | "kids_lyndhurst_quarterly";
type ReportTemplate = {
  id: number;
  name: string;
  originalFileName: string | null;
  engine: ReportEngine | null;
  createdAt: string;
  pullFields: ReportFieldKey[];
  sessionCount: number;
  cleanupMode: CleanupMode;
};

const REPORT_ENGINE_OPTIONS: Array<{ value: ReportEngine; label: string }> = [
  { value: "youth_quarterly", label: "Youth Quarterly Report" },
  { value: "youth_monthly", label: "Youth Monthly Report" },
  { value: "kids_rutherford", label: "Kids Rutherford Report" },
  { value: "kids_lyndhurst", label: "Kids Lyndhurst Report" },
  { value: "kids_rutherford_quarterly", label: "Kids Rutherford Quarterly Report" },
  { value: "kids_lyndhurst_quarterly", label: "Kids Lyndhurst Quarterly Report" },
];
const reportEngineLabel = (engine: ReportEngine | null) =>
  REPORT_ENGINE_OPTIONS.find((option) => option.value === engine)?.label ?? null;
type ScriptSlot = "month_quarter" | "all_dates";
type ReportScriptStatus = {
  slot: ScriptSlot;
  label: string;
  source: "bundled" | "uploaded";
  originalFileName: string | null;
  updatedAt: string | null;
};

type WeeklyPulseSourceOption = { id: string; name: string };
type WeeklyPulseSources = {
  checkinsEvents: WeeklyPulseSourceOption[];
  groups: WeeklyPulseSourceOption[];
  forms: WeeklyPulseSourceOption[];
  groupsError?: string;
  formsError?: string;
};
type WeeklyPulseFormField = { id: string; label: string };
type WeeklyPulseFormEntry = { formId: string; fieldId: string | null };
type WeeklyPulseConfig = {
  id: number;
  name: string;
  enabled: boolean;
  recipientEmails: string[];
  checkinsEventIds: string[];
  groupIds: string[];
  pcoForms: WeeklyPulseFormEntry[];
  lastRunAt: string | null;
  lastRunStatus: "success" | "error" | null;
  lastRunError: string | null;
};



export function ReportingAdminCards() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateEngine, setTemplateEngine] = useState<ReportEngine | "">("");
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
  const [reportScripts, setReportScripts] = useState<ReportScriptStatus[]>([]);
  const [scriptFiles, setScriptFiles] = useState<Partial<Record<ScriptSlot, File>>>({});
  const [savingScript, setSavingScript] = useState<ScriptSlot | null>(null);

  // Weekly Pulse -- the automated Monday-morning attendance summary email
  // (Check-Ins + Groups + an optional Planning Center Form), configured here
  // and fired by the Worker's Cron Trigger (see routes/weeklyPulse.ts).
  const [weeklyPulseConfigs, setWeeklyPulseConfigs] = useState<WeeklyPulseConfig[]>([]);
  const [weeklyPulseSources, setWeeklyPulseSources] = useState<WeeklyPulseSources | null>(null);
  const [weeklyPulseSourcesLoading, setWeeklyPulseSourcesLoading] = useState(false);
  const [weeklyPulseSourcesError, setWeeklyPulseSourcesError] = useState("");
  // Keyed by form id so each row in the "multiple forms" picker below can
  // show its own field dropdown without refetching one already looked up.
  const [weeklyPulseFormFieldsByForm, setWeeklyPulseFormFieldsByForm] = useState<Record<string, WeeklyPulseFormField[]>>({});
  const [editingPulseId, setEditingPulseId] = useState<number | "new" | null>(null);
  const [pulseDraftName, setPulseDraftName] = useState("Weekly Attendance Pulse");
  const [pulseDraftEnabled, setPulseDraftEnabled] = useState(true);
  const [pulseDraftRecipients, setPulseDraftRecipients] = useState("");
  const [pulseDraftCheckinsEventIds, setPulseDraftCheckinsEventIds] = useState<string[]>([]);
  const [pulseDraftGroupIds, setPulseDraftGroupIds] = useState<string[]>([]);
  // { formId: "", fieldId: "" } entries are in-progress rows (form not yet
  // picked); savePulseConfig filters those out before submitting.
  const [pulseDraftForms, setPulseDraftForms] = useState<{ formId: string; fieldId: string }[]>([]);
  const [savingPulse, setSavingPulse] = useState(false);
  const [runningPulseId, setRunningPulseId] = useState<number | null>(null);
  const [downloadingPulseId, setDownloadingPulseId] = useState<number | null>(null);

  const fieldOptions = useMemo(
    () => [...FIELD_OPTIONS, ...planningCenterFields],
    [planningCenterFields],
  );
  const fieldByKey = useMemo(
    () => new Map(fieldOptions.map((field) => [field.key, field])),
    [fieldOptions],
  );

  const reconnectUrl = useMemo(() => {
    const returnTo = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/admin/tools`;
    return `${BASE}/api/auth/planning-center/start?return_to=${encodeURIComponent(returnTo)}`;
  }, []);

  const loadTemplates = async () => {
    const response = await api("/api/reports/templates");
    setTemplates(await response.json() as ReportTemplate[]);
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

  const loadReportScripts = async () => {
    const response = await api("/api/reports/scripts");
    setReportScripts(await response.json() as ReportScriptStatus[]);
  };

  const loadWeeklyPulseConfigs = async () => {
    const response = await api("/api/weekly-pulse/config");
    setWeeklyPulseConfigs(await response.json() as WeeklyPulseConfig[]);
  };

  const loadWeeklyPulseSources = async () => {
    setWeeklyPulseSourcesLoading(true);
    setWeeklyPulseSourcesError("");
    try {
      const response = await api("/api/weekly-pulse/sources");
      setWeeklyPulseSources(await response.json() as WeeklyPulseSources);
    } catch (error) {
      setWeeklyPulseSourcesError(error instanceof Error ? error.message : "Could not load Planning Center sources.");
    } finally {
      setWeeklyPulseSourcesLoading(false);
    }
  };

  const loadWeeklyPulseFormFields = async (formId: string) => {
    if (!formId || weeklyPulseFormFieldsByForm[formId]) return;
    try {
      const response = await api(`/api/weekly-pulse/forms/${encodeURIComponent(formId)}/fields`);
      const fields = await response.json() as WeeklyPulseFormField[];
      setWeeklyPulseFormFieldsByForm((current) => ({ ...current, [formId]: fields }));
    } catch (error) {
      toast({ title: "Could not load form fields", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    }
  };

  useEffect(() => {
    loadTemplates().catch((error) => {
      toast({ title: "Could not load report templates", description: error.message, variant: "destructive" });
    });
    loadPlanningCenterFields();
    loadReportScripts().catch((error) => {
      toast({ title: "Could not load report scripts", description: error.message, variant: "destructive" });
    });
    loadWeeklyPulseConfigs().catch((error) => {
      toast({ title: "Could not load Weekly Pulse configs", description: error.message, variant: "destructive" });
    });
    loadWeeklyPulseSources();
  }, []);

  const { uploadFile, isUploading } = useUpload({
    basePath: `${BASE}/api/storage`,
    getAuthToken: () => sessionStorage.getItem("auth_bearer_token"),
  });

  const addTemplate = async () => {
    if (!templateName.trim() || !templateEngine) return;
    setSavingTemplate(true);
    try {
      await api("/api/reports/templates", {
        method: "POST",
        body: JSON.stringify({
          name: templateName.trim(),
          engine: templateEngine,
        }),
      });
      setTemplateName("");
      setTemplateEngine("");
      await loadTemplates();
      toast({ title: "Report template added" });
    } catch (error) {
      toast({ title: "Could not add template", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
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

  const updateReportScript = async (slot: ScriptSlot) => {
    const file = scriptFiles[slot];
    if (!file) return;
    setSavingScript(slot);
    try {
      const normalizedFile = new File([file], file.name, { type: "text/x-python" });
      const uploaded = await uploadFile(normalizedFile);
      if (!uploaded) throw new Error("The script upload failed.");
      await api(`/api/reports/scripts/${slot}`, {
        method: "PUT",
        body: JSON.stringify({
          originalFileName: file.name,
          objectPath: uploaded.objectPath,
        }),
      });
      setScriptFiles((current) => ({ ...current, [slot]: undefined }));
      await loadReportScripts();
      toast({ title: "Report script updated", description: `${reportScripts.find((script) => script.slot === slot)?.label ?? "Script"} is now active.` });
    } catch (error) {
      toast({ title: "Could not update report script", description: error instanceof Error ? error.message : "Upload failed.", variant: "destructive" });
    } finally {
      setSavingScript(null);
    }
  };

  const resetReportScript = async (script: ReportScriptStatus) => {
    if (!window.confirm(`Reset ${script.label} to the bundled version?`)) return;
    setSavingScript(script.slot);
    try {
      await api(`/api/reports/scripts/${script.slot}`, { method: "DELETE" });
      await loadReportScripts();
      toast({ title: "Report script reset", description: `${script.label} now uses the bundled version.` });
    } catch (error) {
      toast({ title: "Could not reset report script", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setSavingScript(null);
    }
  };

  const resetPulseDraft = () => {
    setPulseDraftName("Weekly Attendance Pulse");
    setPulseDraftEnabled(true);
    setPulseDraftRecipients("");
    setPulseDraftCheckinsEventIds([]);
    setPulseDraftGroupIds([]);
    setPulseDraftForms([]);
  };

  const startNewPulseConfig = () => {
    resetPulseDraft();
    setEditingPulseId("new");
  };

  const editPulseConfig = (config: WeeklyPulseConfig) => {
    if (editingPulseId === config.id) {
      setEditingPulseId(null);
      return;
    }
    setPulseDraftName(config.name);
    setPulseDraftEnabled(config.enabled);
    setPulseDraftRecipients(config.recipientEmails.join(", "));
    setPulseDraftCheckinsEventIds(config.checkinsEventIds);
    setPulseDraftGroupIds(config.groupIds);
    setPulseDraftForms(config.pcoForms.map((form) => ({ formId: form.formId, fieldId: form.fieldId ?? "" })));
    config.pcoForms.forEach((form) => loadWeeklyPulseFormFields(form.formId));
    setEditingPulseId(config.id);
  };

  const togglePulseCheckinsEvent = (id: string, checked: boolean) => {
    setPulseDraftCheckinsEventIds((current) =>
      checked ? [...current, id] : current.filter((value) => value !== id),
    );
  };

  const togglePulseGroup = (id: string, checked: boolean) => {
    setPulseDraftGroupIds((current) =>
      checked ? [...current, id] : current.filter((value) => value !== id),
    );
  };

  const addPulseFormRow = () => {
    setPulseDraftForms((current) => [...current, { formId: "", fieldId: "" }]);
  };

  const removePulseFormRow = (index: number) => {
    setPulseDraftForms((current) => current.filter((_, i) => i !== index));
  };

  const updatePulseFormRowFormId = (index: number, formId: string) => {
    setPulseDraftForms((current) => current.map((row, i) => (i === index ? { formId, fieldId: "" } : row)));
    loadWeeklyPulseFormFields(formId);
  };

  const updatePulseFormRowFieldId = (index: number, fieldId: string) => {
    setPulseDraftForms((current) => current.map((row, i) => (i === index ? { ...row, fieldId } : row)));
  };

  const savePulseConfig = async () => {
    const recipientEmails = pulseDraftRecipients
      .split(/[,\n]/)
      .map((email) => email.trim())
      .filter(Boolean);
    const pcoForms = pulseDraftForms
      .filter((row) => row.formId)
      .map((row) => ({ formId: row.formId, fieldId: row.fieldId || null }));
    setSavingPulse(true);
    try {
      await api("/api/weekly-pulse/config", {
        method: "POST",
        body: JSON.stringify({
          id: typeof editingPulseId === "number" ? editingPulseId : undefined,
          name: pulseDraftName.trim() || "Weekly Attendance Pulse",
          enabled: pulseDraftEnabled,
          recipientEmails,
          checkinsEventIds: pulseDraftCheckinsEventIds,
          groupIds: pulseDraftGroupIds,
          pcoForms,
        }),
      });
      await loadWeeklyPulseConfigs();
      setEditingPulseId(null);
      toast({ title: "Weekly Pulse saved" });
    } catch (error) {
      toast({ title: "Could not save Weekly Pulse", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setSavingPulse(false);
    }
  };

  const deletePulseConfig = async (config: WeeklyPulseConfig) => {
    if (!window.confirm(`Delete the "${config.name}" Weekly Pulse report?`)) return;
    try {
      await api(`/api/weekly-pulse/config/${config.id}`, { method: "DELETE" });
      await loadWeeklyPulseConfigs();
      toast({ title: "Weekly Pulse deleted" });
    } catch (error) {
      toast({ title: "Could not delete Weekly Pulse", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    }
  };

  const runPulseNow = async (config: WeeklyPulseConfig) => {
    setRunningPulseId(config.id);
    try {
      await api(`/api/weekly-pulse/config/${config.id}/run-now`, { method: "POST" });
      await loadWeeklyPulseConfigs();
      toast({ title: "Test email sent", description: `${config.name} was sent to its recipients.` });
    } catch (error) {
      toast({ title: "Could not send test email", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
      await loadWeeklyPulseConfigs();
    } finally {
      setRunningPulseId(null);
    }
  };

  const downloadPulseReport = async (config: WeeklyPulseConfig) => {
    setDownloadingPulseId(config.id);
    try {
      const response = await api(`/api/weekly-pulse/config/${config.id}/latest-report.csv`);
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? "weekly-pulse.csv";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Could not download report", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setDownloadingPulseId(null);
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
      setEditingTemplateId(null);
      toast({ title: "Template settings saved" });
    } catch (error) {
      toast({ title: "Could not save template settings", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Manage templates</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="template-name">Template name</Label>
                <Input id="template-name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Monthly Youth Report" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-engine">Report engine</Label>
                <select
                  id="template-engine"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={templateEngine}
                  onChange={(event) => setTemplateEngine(event.target.value as ReportEngine | "")}
                >
                  <option value="" disabled>Select a report engine…</option>
                  {REPORT_ENGINE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <Button
                onClick={addTemplate}
                disabled={!templateName.trim() || !templateEngine || savingTemplate || isUploading}
              >
                {(savingTemplate || isUploading) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Every report is built by Transform Church&apos;s own pure-Python renderer (PDF only) &mdash; no workbook upload needed.
            </p>
            <div className="divide-y rounded-lg border">
              {!templates.length && <p className="p-4 text-sm text-muted-foreground">No report templates have been added.</p>}
              {templates.map((template) => (
                <div key={template.id} className="p-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">{template.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {template.engine ? `${reportEngineLabel(template.engine)} (built-in, PDF only)` : "No engine configured"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {template.pullFields.length} profile fields · {template.cleanupMode === "all_dates" ? "All Dates" : `${template.sessionCount} sessions`}
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
                      {draftCleanupMode === "month_quarter" && (
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
                      )}
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
                          disabled={
                            savingSettings
                            || !draftTemplateName.trim()
                            || (draftCleanupMode === "month_quarter"
                              && (!Number.isInteger(draftSessionCount) || draftSessionCount < 1 || draftSessionCount > 52))
                          }
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
            <div className="border-t pt-5">
              <div>
                <h3 className="font-semibold">Processing scripts</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Admin-uploaded Python runs with the API server&apos;s access. Only upload scripts you trust and have reviewed.
                </p>
              </div>
              <div className="mt-4 divide-y rounded-lg border">
                {reportScripts.map((script) => (
                  <div key={script.slot} className="grid items-end gap-3 p-4 md:grid-cols-[1fr_1fr_auto_auto]">
                    <div>
                      <p className="font-medium">{script.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {script.source === "uploaded"
                          ? `${script.originalFileName} · uploaded ${script.updatedAt ? new Date(script.updatedAt).toLocaleString() : "recently"}`
                          : "Using the bundled version"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`report-script-${script.slot}`}>Python file</Label>
                      <Input
                        id={`report-script-${script.slot}`}
                        type="file"
                        accept=".py,text/x-python"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          setScriptFiles((current) => ({ ...current, [script.slot]: file }));
                        }}
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => updateReportScript(script.slot)}
                      disabled={!scriptFiles[script.slot] || savingScript !== null || isUploading}
                    >
                      {(savingScript === script.slot || (isUploading && !!scriptFiles[script.slot]))
                        ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        : <Upload className="mr-2 h-4 w-4" />}
                      Update
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resetReportScript(script)}
                      disabled={script.source === "bundled" || savingScript !== null}
                    >
                      Reset
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Weekly Pulse</CardTitle>
            <p className="text-sm text-muted-foreground">
              An automated email, sent every Monday morning, with a simple numbers summary of attendance from the
              Check-Ins events and Groups you pick below, plus an optional count from a Planning Center form.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {weeklyPulseSourcesError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <span>{weeklyPulseSourcesError}</span>
                <Button type="button" size="sm" variant="outline" onClick={loadWeeklyPulseSources}>Try again</Button>
              </div>
            )}

            <div className="divide-y rounded-lg border">
              {!weeklyPulseConfigs.length && (
                <p className="p-4 text-sm text-muted-foreground">No Weekly Pulse reports have been set up yet.</p>
              )}
              {weeklyPulseConfigs.map((config) => (
                <div key={config.id} className="p-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {config.name}
                        {!config.enabled && <span className="ml-2 text-xs text-muted-foreground">(disabled)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {config.recipientEmails.length} recipient{config.recipientEmails.length === 1 ? "" : "s"}
                        {" · "}
                        {config.checkinsEventIds.length} Check-Ins event{config.checkinsEventIds.length === 1 ? "" : "s"}
                        {" · "}
                        {config.groupIds.length} group{config.groupIds.length === 1 ? "" : "s"}
                        {config.pcoForms.length ? ` · ${config.pcoForms.length} form${config.pcoForms.length === 1 ? "" : "s"}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {config.lastRunAt
                          ? `Last run ${new Date(config.lastRunAt).toLocaleString()} -- ${config.lastRunStatus === "success" ? "sent" : `failed${config.lastRunError ? `: ${config.lastRunError}` : ""}`}`
                          : "Not run yet"}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => runPulseNow(config)}
                        disabled={runningPulseId !== null}
                      >
                        {runningPulseId === config.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Send test now
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadPulseReport(config)}
                        disabled={downloadingPulseId !== null}
                        title="Download the numbers from the most recent run as a CSV"
                      >
                        {downloadingPulseId === config.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Latest report
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => editPulseConfig(config)}>
                        <Settings2 className="mr-2 h-4 w-4" /> Edit
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deletePulseConfig(config)} aria-label={`Delete ${config.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {editingPulseId === config.id && (
                    <PulseConfigForm
                      idPrefix={`pulse-${config.id}`}
                      name={pulseDraftName}
                      setName={setPulseDraftName}
                      enabled={pulseDraftEnabled}
                      setEnabled={setPulseDraftEnabled}
                      recipients={pulseDraftRecipients}
                      setRecipients={setPulseDraftRecipients}
                      sources={weeklyPulseSources}
                      sourcesLoading={weeklyPulseSourcesLoading}
                      checkinsEventIds={pulseDraftCheckinsEventIds}
                      onToggleCheckinsEvent={togglePulseCheckinsEvent}
                      groupIds={pulseDraftGroupIds}
                      onToggleGroup={togglePulseGroup}
                      forms={pulseDraftForms}
                      onAddForm={addPulseFormRow}
                      onRemoveForm={removePulseFormRow}
                      onFormIdChange={updatePulseFormRowFormId}
                      onFieldIdChange={updatePulseFormRowFieldId}
                      formFieldsByForm={weeklyPulseFormFieldsByForm}
                      saving={savingPulse}
                      onSave={savePulseConfig}
                      onCancel={() => setEditingPulseId(null)}
                      reconnectUrl={reconnectUrl}
                      onRetrySources={loadWeeklyPulseSources}
                    />
                  )}
                </div>
              ))}
            </div>

            {editingPulseId === "new" ? (
              <div className="rounded-lg border bg-muted/20 p-4">
                <PulseConfigForm
                  idPrefix="pulse-new"
                  name={pulseDraftName}
                  setName={setPulseDraftName}
                  enabled={pulseDraftEnabled}
                  setEnabled={setPulseDraftEnabled}
                  recipients={pulseDraftRecipients}
                  setRecipients={setPulseDraftRecipients}
                  sources={weeklyPulseSources}
                  sourcesLoading={weeklyPulseSourcesLoading}
                  checkinsEventIds={pulseDraftCheckinsEventIds}
                  onToggleCheckinsEvent={togglePulseCheckinsEvent}
                  groupIds={pulseDraftGroupIds}
                  onToggleGroup={togglePulseGroup}
                  forms={pulseDraftForms}
                  onAddForm={addPulseFormRow}
                  onRemoveForm={removePulseFormRow}
                  onFormIdChange={updatePulseFormRowFormId}
                  onFieldIdChange={updatePulseFormRowFieldId}
                  formFieldsByForm={weeklyPulseFormFieldsByForm}
                  saving={savingPulse}
                  onSave={savePulseConfig}
                  onCancel={() => setEditingPulseId(null)}
                  reconnectUrl={reconnectUrl}
                  onRetrySources={loadWeeklyPulseSources}
                />
              </div>
            ) : (
              <Button variant="outline" onClick={startNewPulseConfig}>
                <Plus className="mr-2 h-4 w-4" /> Add Weekly Pulse report
              </Button>
            )}
          </CardContent>
        </Card>

      <AttendanceHistoryCard />

      <GroupHistoryCard />
    </div>
  );
}

// One-time (re-runnable) pull of weekly Check-Ins attendance for every
// event, active and archived, into the attendance history table -- see
// routes/attendanceHistory.ts. Driven step by step from the browser so no
// single request runs long; keep the tab open while it runs.
const HISTORY_MAX_WEEKS_PER_CALL = 8;
const HISTORY_MAX_PERIODS_PER_CALL = 60;

type HistoryEvent = { id: string; name: string; archived: boolean };
type HistoryWeek = { weekStart: string; weekEnd: string; periodIds: string[] };
type HistorySummary = { rows: number; events: number; firstWeek: string | null; lastWeek: string | null; lastFetchedAt: string | null };

function batchHistoryWeeks(weeks: HistoryWeek[]): HistoryWeek[][] {
  const batches: HistoryWeek[][] = [];
  let current: HistoryWeek[] = [];
  let periods = 0;
  for (const week of weeks) {
    if (current.length && (current.length >= HISTORY_MAX_WEEKS_PER_CALL || periods + week.periodIds.length > HISTORY_MAX_PERIODS_PER_CALL)) {
      batches.push(current);
      current = [];
      periods = 0;
    }
    current.push(week);
    periods += week.periodIds.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

// ── Timeframe picker shared by both history cards ──────────────────────────
// Checkboxes per quarter (plus a whole-year box) choose which weeks a pull
// covers. A week belongs to the quarter its Monday falls in, matching the
// Monday-start weeks the history tables use.
const TIMEFRAME_FIRST_YEAR = 2023;
const DEFAULT_TIMEFRAME_FROM = "2024-Q1"; // the original "since Jan 1, 2024" pull

type QuarterKey = string; // "2025-Q3"

function currentQuarter(now = new Date()): { year: number; quarter: number } {
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

function quarterKeysByYear(): { year: number; quarters: QuarterKey[] }[] {
  const { year: thisYear, quarter: thisQuarter } = currentQuarter();
  const years = [];
  for (let year = thisYear; year >= TIMEFRAME_FIRST_YEAR; year -= 1) {
    const last = year === thisYear ? thisQuarter : 4;
    years.push({ year, quarters: Array.from({ length: last }, (_, i) => `${year}-Q${i + 1}`) });
  }
  return years;
}

function defaultTimeframe(): Set<QuarterKey> {
  return new Set(quarterKeysByYear().flatMap((y) => y.quarters).filter((key) => key >= DEFAULT_TIMEFRAME_FROM));
}

// [start, endExclusive) as YYYY-MM-DD for a quarter key.
function quarterRange(key: QuarterKey): [string, string] {
  const [yearText, q] = key.split("-Q");
  const year = Number(yearText);
  const startMonth = (Number(q) - 1) * 3;
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(startMonth + 1)}-01`;
  const end = startMonth + 3 >= 12 ? `${year + 1}-01-01` : `${year}-${pad(startMonth + 4)}-01`;
  return [start, end];
}

function timeframeEnd(selected: Set<QuarterKey>): string | null {
  const keys = [...selected].sort();
  return keys.length ? quarterRange(keys[keys.length - 1])[1] : null;
}

function timeframeStart(selected: Set<QuarterKey>): string | null {
  const keys = [...selected].sort();
  return keys.length ? quarterRange(keys[0])[0] : null;
}

function weekInTimeframe(weekStart: string, selected: Set<QuarterKey>): boolean {
  for (const key of selected) {
    const [start, end] = quarterRange(key);
    if (weekStart >= start && weekStart < end) return true;
  }
  return false;
}

function describeTimeframe(selected: Set<QuarterKey>): string {
  const keys = [...selected].sort();
  if (!keys.length) return "no quarters";
  const label = (key: QuarterKey) => key.replace("-", " ");
  if (keys.length === 1) return label(keys[0]);
  const all = quarterKeysByYear().flatMap((y) => y.quarters).sort();
  const first = all.indexOf(keys[0]);
  const contiguous = keys.every((key, i) => all[first + i] === key);
  return contiguous
    ? `${label(keys[0])} – ${label(keys[keys.length - 1])} (${keys.length} quarters)`
    : `${keys.length} quarters: ${keys.map(label).join(", ")}`;
}

function TimeframePicker({ selected, onChange, disabled }: {
  selected: Set<QuarterKey>;
  onChange: (next: Set<QuarterKey>) => void;
  disabled?: boolean;
}) {
  const years = quarterKeysByYear();
  const toggle = (keys: QuarterKey[], on: boolean) => {
    const next = new Set(selected);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    onChange(next);
  };
  return (
    <fieldset className="space-y-2 rounded-md border p-3" disabled={disabled}>
      <legend className="px-1 text-sm font-medium">Timeframe to pull</legend>
      {years.map(({ year, quarters }) => {
        const count = quarters.filter((key) => selected.has(key)).length;
        return (
          <div key={year} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <label className="flex w-16 items-center gap-2 font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={count === quarters.length}
                ref={(el) => { if (el) el.indeterminate = count > 0 && count < quarters.length; }}
                onChange={(event) => toggle(quarters, event.target.checked)}
              />
              {year}
            </label>
            {quarters.map((key) => (
              <label key={key} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={selected.has(key)}
                  onChange={(event) => toggle([key], event.target.checked)}
                />
                {key.split("-")[1]}
              </label>
            ))}
          </div>
        );
      })}
      <div className="flex gap-3 pt-1 text-xs">
        <button type="button" className="underline text-muted-foreground" onClick={() => onChange(new Set(years.flatMap((y) => y.quarters)))}>Select all</button>
        <button type="button" className="underline text-muted-foreground" onClick={() => onChange(new Set())}>Clear</button>
      </div>
    </fieldset>
  );
}

function AttendanceHistoryCard() {
  const { toast } = useToast();
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [failures, setFailures] = useState<{ eventName: string; error: string }[]>([]);
  const [timeframe, setTimeframe] = useState<Set<QuarterKey>>(defaultTimeframe);
  const stopRequested = useRef(false);

  const loadSummary = async () => {
    try {
      const response = await api("/api/attendance-history/summary");
      setSummary(await response.json() as HistorySummary);
    } catch {
      setSummary(null);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const runPull = async () => {
    const since = timeframeStart(timeframe);
    if (!since) return;
    const selection = new Set(timeframe);
    if (!window.confirm(`Pull weekly attendance for every Check-Ins event for ${describeTimeframe(selection)}? This can take a while. Keep this tab open until it finishes.`)) return;
    stopRequested.current = false;
    setRunning(true);
    setFailures([]);
    let weeksSaved = 0;
    const failed: { eventName: string; error: string }[] = [];
    try {
      setProgress("Loading Check-Ins events…");
      const events = await (await api("/api/attendance-history/events")).json() as HistoryEvent[];
      for (const [index, event] of events.entries()) {
        if (stopRequested.current) break;
        const label = `Event ${index + 1} of ${events.length}: ${event.name}`;
        try {
          setProgress(`${label} (finding sessions…)`);
          const weeks = (await (await api(
            `/api/attendance-history/events/${encodeURIComponent(event.id)}/weeks?since=${since}`,
          )).json() as HistoryWeek[]).filter((week) => weekInTimeframe(week.weekStart, selection));
          const batches = batchHistoryWeeks(weeks);
          let done = 0;
          for (const batch of batches) {
            if (stopRequested.current) break;
            setProgress(`${label} (${done} of ${weeks.length} weeks)`);
            await api(`/api/attendance-history/events/${encodeURIComponent(event.id)}/weeks`, {
              method: "POST",
              body: JSON.stringify({ eventName: event.name, archived: event.archived, weeks: batch }),
            });
            done += batch.length;
            weeksSaved += batch.length;
          }
        } catch (error) {
          failed.push({ eventName: event.name, error: error instanceof Error ? error.message : "Request failed." });
          setFailures([...failed]);
        }
      }
      toast({
        title: stopRequested.current ? "Attendance history pull stopped" : "Attendance history pull finished",
        description: `${weeksSaved} event-weeks saved${failed.length ? `, ${failed.length} event${failed.length === 1 ? "" : "s"} failed` : ""}.`,
        variant: failed.length ? "destructive" : undefined,
      });
    } catch (error) {
      toast({ title: "Could not pull attendance history", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setRunning(false);
      setProgress("");
      await loadSummary();
    }
  };

  const downloadHistory = async () => {
    try {
      const response = await api("/api/attendance-history/history.csv");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "attendance-history-by-week.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Could not download history", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Attendance history</CardTitle>
        <p className="text-sm text-muted-foreground">
          Pulls weekly Check-Ins attendance for every event, active and archived, for the quarters you check below,
          using the same Monday-to-Monday weeks as the Weekly Pulse. Read-only in Planning Center. Safe to run again:
          it refreshes the weeks it already has.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {summary && summary.rows > 0
            ? `${summary.rows} event-weeks saved across ${summary.events} events (${summary.firstWeek} to ${summary.lastWeek}).`
            : "No history pulled yet."}
        </p>
        <TimeframePicker selected={timeframe} onChange={setTimeframe} disabled={running} />
        {running && (
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> {progress} Keep this tab open.
          </p>
        )}
        {failures.length > 0 && (
          <div className="rounded-md border border-destructive/40 p-3 text-sm">
            <p className="font-medium text-destructive">Some events could not be pulled (run again to retry them):</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {failures.map((failure) => <li key={failure.eventName}>{failure.eventName}: {failure.error}</li>)}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {running ? (
            <Button variant="outline" onClick={() => { stopRequested.current = true; }}>Stop</Button>
          ) : (
            <Button onClick={runPull} disabled={!timeframe.size}>
              <RefreshCw className="mr-2 h-4 w-4" /> Pull selected timeframe
            </Button>
          )}
          <Button variant="outline" onClick={downloadHistory} disabled={running || !summary?.rows}>
            <Download className="mr-2 h-4 w-4" /> Download history CSV
          </Button>
        </div>
        <WeekSubstitutions />
      </CardContent>
    </Card>
  );
}

type WeekSubstitution = {
  eventId: string;
  eventName: string;
  weekStart: string;
  sourceEventId: string;
  sourceEventName: string;
  ownAttendees: number | null;
  sourceAttendees: number | null;
};

// "Use another event's numbers for one week" -- e.g. the Summer Finale
// Concert stood in for a normal Youth night. Only the report trend charts
// use these; Planning Center itself is never changed.
function WeekSubstitutions() {
  const { toast } = useToast();
  const [items, setItems] = useState<WeekSubstitution[]>([]);
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api("/api/attendance-history/overrides")
      .then((response) => response.json())
      .then((data) => setItems(data as WeekSubstitution[]))
      .catch(() => setItems([]));
  }, []);

  const loadEvents = async () => {
    setLoadingEvents(true);
    try {
      setEvents(await (await api("/api/attendance-history/events")).json() as HistoryEvent[]);
    } catch (error) {
      toast({ title: "Could not load Check-Ins events", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setLoadingEvents(false);
    }
  };

  const save = async () => {
    const target = events?.find((event) => event.id === targetId);
    const source = events?.find((event) => event.id === sourceId);
    if (!target || !source || !date) return;
    setSaving(true);
    try {
      const response = await api("/api/attendance-history/overrides", {
        method: "POST",
        body: JSON.stringify({
          eventId: target.id, eventName: target.name,
          sourceEventId: source.id, sourceEventName: source.name, sourceArchived: source.archived,
          date,
        }),
      });
      setItems(await response.json() as WeekSubstitution[]);
      toast({ title: "Week substitution saved", description: `${target.name} will use ${source.name}'s numbers for that week.` });
      setSourceId("");
      setDate("");
    } catch (error) {
      toast({ title: "Could not save the substitution", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: WeekSubstitution) => {
    try {
      const response = await api(`/api/attendance-history/overrides?eventId=${encodeURIComponent(item.eventId)}&weekStart=${item.weekStart}`, { method: "DELETE" });
      setItems(await response.json() as WeekSubstitution[]);
    } catch (error) {
      toast({ title: "Could not remove the substitution", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    }
  };

  const filteredSources = (events ?? []).filter((event) =>
    event.id !== targetId && event.name.toLowerCase().includes(sourceFilter.trim().toLowerCase()));
  const selectClass = "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div className="space-y-3 rounded-md border p-3 text-sm">
      <div>
        <p className="font-medium">Week substitutions</p>
        <p className="text-xs text-muted-foreground">
          When a one-off event replaced an event's normal service (for example a concert instead of a regular Youth
          night), use that event's attendance for the week in the reports' trend charts. Planning Center isn't changed.
        </p>
      </div>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={`${item.eventId}-${item.weekStart}`} className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1">
              <span>
                <strong>{item.eventName}</strong>, week of {item.weekStart}: using <strong>{item.sourceEventName}</strong>
                {item.sourceAttendees !== null ? ` (${item.sourceAttendees} attendees` : ""}
                {item.sourceAttendees !== null && item.ownAttendees !== null ? ` instead of ${item.ownAttendees})` : item.sourceAttendees !== null ? ")" : ""}
              </span>
              <Button size="sm" variant="ghost" onClick={() => remove(item)}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      {events === null ? (
        <Button size="sm" variant="outline" onClick={loadEvents} disabled={loadingEvents}>
          {loadingEvents ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add a week substitution
        </Button>
      ) : (
        <div className="grid gap-2 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="sub-target">Event to fix</Label>
            <select id="sub-target" className={selectClass} value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">Choose…</option>
              {events.filter((event) => !event.archived).map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sub-date">Date (any day that week)</Label>
            <Input id="sub-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sub-source">Use numbers from</Label>
            <Input placeholder="Search events…" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} />
            <select id="sub-source" className={selectClass} value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
              <option value="">Choose…</option>
              {filteredSources.map((event) => (
                <option key={event.id} value={event.id}>{event.name}{event.archived ? " (archived)" : ""}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <Button size="sm" onClick={save} disabled={saving || !targetId || !sourceId || !date}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Save substitution
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Groups counterpart of AttendanceHistoryCard: weekly Planning Center Groups
// attendance for every group into groups_weekly_history -- see
// routes/groupHistory.ts. Same step-by-step, keep-the-tab-open pattern.
const GROUP_HISTORY_MAX_WEEKS_PER_CALL = 8;
const GROUP_HISTORY_MAX_MEETINGS_PER_CALL = 20;

type HistoryGroup = { id: string; name: string; archived: boolean };
type GroupAutoSyncRun = {
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "success" | "partial" | "error";
  groupsChecked: number;
  weeksSaved: number;
  failures: { group: string; error: string }[];
  message?: string;
};
type GroupAutoSync = { enabled: boolean; lastRun: GroupAutoSyncRun | null; usesYourConnection: boolean };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Pacing for manual group pulls: a short pause between Planning Center calls,
// and on a rate-limit/server error a longer wait before retrying, so a big
// pull slows down instead of losing groups.
const GROUP_PULL_PAUSE_MS = 400;
const GROUP_PULL_RETRY_WAITS_MS = [20_000, 60_000, 120_000];

async function apiWithRetry(path: string, options: RequestInit | undefined, onWait: (seconds: number) => void): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await wait(GROUP_PULL_PAUSE_MS);
      return await api(path, options);
    } catch (error) {
      const status = (error as { status?: number }).status;
      const retryable = status === undefined || status === 429 || status >= 500;
      if (!retryable || attempt >= GROUP_PULL_RETRY_WAITS_MS.length) throw error;
      onWait(GROUP_PULL_RETRY_WAITS_MS[attempt] / 1000);
      await wait(GROUP_PULL_RETRY_WAITS_MS[attempt]);
    }
  }
}
type GroupHistoryWeek = { weekStart: string; weekEnd: string; meetingIds: string[] };
type GroupHistorySummary = { rows: number; groups: number; firstWeek: string | null; lastWeek: string | null; lastFetchedAt: string | null };

function batchGroupWeeks(weeks: GroupHistoryWeek[]): GroupHistoryWeek[][] {
  const batches: GroupHistoryWeek[][] = [];
  let current: GroupHistoryWeek[] = [];
  let meetings = 0;
  for (const week of weeks) {
    if (current.length && (current.length >= GROUP_HISTORY_MAX_WEEKS_PER_CALL || meetings + week.meetingIds.length > GROUP_HISTORY_MAX_MEETINGS_PER_CALL)) {
      batches.push(current);
      current = [];
      meetings = 0;
    }
    current.push(week);
    meetings += week.meetingIds.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

function GroupHistoryCard() {
  const { toast } = useToast();
  const [summary, setSummary] = useState<GroupHistorySummary | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [failures, setFailures] = useState<{ groupName: string; error: string }[]>([]);
  const [timeframe, setTimeframe] = useState<Set<QuarterKey>>(defaultTimeframe);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [autoSync, setAutoSync] = useState<GroupAutoSync | null>(null);
  const [savingAutoSync, setSavingAutoSync] = useState(false);
  const stopRequested = useRef(false);

  const loadSummary = async () => {
    try {
      const response = await api("/api/group-history/summary");
      setSummary(await response.json() as GroupHistorySummary);
    } catch {
      setSummary(null);
    }
  };

  const loadAutoSync = async () => {
    try {
      const response = await api("/api/group-history/auto-sync");
      setAutoSync(await response.json() as GroupAutoSync);
    } catch {
      setAutoSync(null);
    }
  };

  useEffect(() => {
    loadSummary();
    loadAutoSync();
  }, []);

  const toggleAutoSync = async (enabled: boolean) => {
    setSavingAutoSync(true);
    try {
      const response = await api("/api/group-history/auto-sync", { method: "POST", body: JSON.stringify({ enabled }) });
      setAutoSync(await response.json() as GroupAutoSync);
      toast({ title: enabled ? "Weekly group sync turned on" : "Weekly group sync turned off" });
    } catch (error) {
      toast({ title: "Could not save the weekly sync setting", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setSavingAutoSync(false);
    }
  };

  const runPull = async () => {
    const since = timeframeStart(timeframe);
    const until = timeframeEnd(timeframe);
    if (!since || !until) return;
    const selection = new Set(timeframe);
    const what = onlyMissing ? "missing weeks of group attendance" : "weekly group attendance (re-pulling saved weeks too)";
    if (!window.confirm(`Pull ${what} for ${describeTimeframe(selection)}? Only groups that existed in that timeframe are checked. This can take a while. Keep this tab open until it finishes.`)) return;
    stopRequested.current = false;
    setRunning(true);
    setFailures([]);
    let weeksSaved = 0;
    let upToDate = 0;
    let consecutiveFailures = 0;
    const failed: { groupName: string; error: string }[] = [];
    try {
      setProgress("Finding groups that existed in this timeframe…");
      const { groups, total } = await (await api(
        `/api/group-history/groups?since=${since}&until=${until}`,
      )).json() as { groups: HistoryGroup[]; total: number };
      const saved: Record<string, string[]> = onlyMissing
        ? await (await api(`/api/group-history/saved-weeks?since=${since}&until=${until}`)).json()
        : {};
      const skippedInactive = total - groups.length;
      for (const [index, group] of groups.entries()) {
        if (stopRequested.current) break;
        const label = `Group ${index + 1} of ${groups.length}: ${group.name}`;
        const onWait = (seconds: number) => setProgress(`${label}: Planning Center is busy, waiting ${seconds}s before retrying…`);
        try {
          setProgress(`${label} (finding meetings…)`);
          const savedWeeks = new Set(saved[group.id] ?? []);
          const weeks = (await (await apiWithRetry(
            `/api/group-history/groups/${encodeURIComponent(group.id)}/weeks?since=${since}`, undefined, onWait,
          )).json() as GroupHistoryWeek[])
            .filter((week) => weekInTimeframe(week.weekStart, selection))
            .filter((week) => !onlyMissing || !savedWeeks.has(week.weekStart));
          if (!weeks.length) upToDate += 1;
          let done = 0;
          for (const batch of batchGroupWeeks(weeks)) {
            if (stopRequested.current) break;
            setProgress(`${label} (${done} of ${weeks.length} weeks)`);
            await apiWithRetry(`/api/group-history/groups/${encodeURIComponent(group.id)}/weeks`, {
              method: "POST",
              body: JSON.stringify({ groupName: group.name, archived: group.archived, weeks: batch }),
            }, onWait);
            done += batch.length;
            weeksSaved += batch.length;
          }
          consecutiveFailures = 0;
        } catch (error) {
          failed.push({ groupName: group.name, error: error instanceof Error ? error.message : "Request failed." });
          setFailures([...failed]);
          consecutiveFailures += 1;
          if (consecutiveFailures >= 3 && !stopRequested.current) {
            setProgress("Several groups failed in a row; pausing 2 minutes to let Planning Center recover…");
            await wait(120_000);
            consecutiveFailures = 0;
          }
        }
      }
      toast({
        title: stopRequested.current ? "Group history pull stopped" : "Group history pull finished",
        description: `${weeksSaved} group-weeks saved, ${upToDate} group${upToDate === 1 ? "" : "s"} already up to date, ${skippedInactive} skipped as inactive in this timeframe${failed.length ? `, ${failed.length} failed (run again to retry them)` : ""}.`,
        variant: failed.length ? "destructive" : undefined,
      });
    } catch (error) {
      toast({ title: "Could not pull group history", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setRunning(false);
      setProgress("");
      await loadSummary();
    }
  };

  const downloadHistory = async () => {
    try {
      const response = await api("/api/group-history/history.csv");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "group-attendance-history-by-week.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Could not download group history", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Group attendance history</CardTitle>
        <p className="text-sm text-muted-foreground">
          Pulls weekly attendance for Planning Center groups for the quarters you check below, in the same
          Monday-to-Monday weeks. Only groups that existed in that timeframe are checked, and by default only weeks
          that aren't saved yet, so running it again fills gaps. Counts people marked present; weeks where no
          attendance was taken are left blank, not zero. Read-only in Planning Center.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {summary && summary.rows > 0
            ? `${summary.rows} group-weeks saved across ${summary.groups} groups (${summary.firstWeek} to ${summary.lastWeek}).`
            : "No group history pulled yet."}
        </p>
        <TimeframePicker selected={timeframe} onChange={setTimeframe} disabled={running} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={onlyMissing}
            disabled={running}
            onChange={(event) => setOnlyMissing(event.target.checked)}
          />
          Only pull weeks that aren't saved yet (fill gaps)
        </label>
        {running && (
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> {progress} Keep this tab open.
          </p>
        )}
        {failures.length > 0 && (
          <div className="rounded-md border border-destructive/40 p-3 text-sm">
            <p className="font-medium text-destructive">Some groups could not be pulled (run again with "Only pull weeks that aren't saved yet" to retry just those):</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {failures.map((failure) => <li key={failure.groupName}>{failure.groupName}: {failure.error}</li>)}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {running ? (
            <Button variant="outline" onClick={() => { stopRequested.current = true; }}>Stop</Button>
          ) : (
            <Button onClick={runPull} disabled={!timeframe.size}>
              <RefreshCw className="mr-2 h-4 w-4" /> Pull selected timeframe
            </Button>
          )}
          <Button variant="outline" onClick={downloadHistory} disabled={running || !summary?.rows}>
            <Download className="mr-2 h-4 w-4" /> Download group history CSV
          </Button>
        </div>
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={!!autoSync?.enabled}
              disabled={savingAutoSync || !autoSync}
              onChange={(event) => toggleAutoSync(event.target.checked)}
            />
            Update automatically every week (Mondays around 3am)
          </label>
          <p className="text-xs text-muted-foreground">
            Slowly re-pulls the last 3 weeks for groups that are active now (leaders often enter attendance late) and
            fills any missing week from the last 12, adding new weeks to this tracker. Uses the Planning Center
            connection of the admin who turns it on{autoSync?.enabled && !autoSync.usesYourConnection ? " (currently another admin's)" : ""}.
          </p>
          {autoSync?.lastRun && (
            <p className="text-xs text-muted-foreground">
              Last run {new Date(autoSync.lastRun.startedAt).toLocaleString()}: {autoSync.lastRun.status === "running"
                ? "still running"
                : `${autoSync.lastRun.status}, ${autoSync.lastRun.weeksSaved} weeks saved from ${autoSync.lastRun.groupsChecked} groups`}
              {autoSync.lastRun.failures.length ? `, ${autoSync.lastRun.failures.length} failed (${autoSync.lastRun.failures.slice(0, 3).map((f) => f.group).join(", ")}${autoSync.lastRun.failures.length > 3 ? "…" : ""})` : ""}
              {autoSync.lastRun.message ? ` — ${autoSync.lastRun.message}` : ""}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PulseConfigForm({
  idPrefix,
  name,
  setName,
  enabled,
  setEnabled,
  recipients,
  setRecipients,
  sources,
  sourcesLoading,
  checkinsEventIds,
  onToggleCheckinsEvent,
  groupIds,
  onToggleGroup,
  forms,
  onAddForm,
  onRemoveForm,
  onFormIdChange,
  onFieldIdChange,
  formFieldsByForm,
  saving,
  onSave,
  onCancel,
  reconnectUrl,
  onRetrySources,
}: {
  idPrefix: string;
  name: string;
  setName: (value: string) => void;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  recipients: string;
  setRecipients: (value: string) => void;
  sources: WeeklyPulseSources | null;
  sourcesLoading: boolean;
  checkinsEventIds: string[];
  onToggleCheckinsEvent: (id: string, checked: boolean) => void;
  groupIds: string[];
  onToggleGroup: (id: string, checked: boolean) => void;
  forms: { formId: string; fieldId: string }[];
  onAddForm: () => void;
  onRemoveForm: (index: number) => void;
  onFormIdChange: (index: number, formId: string) => void;
  onFieldIdChange: (index: number, fieldId: string) => void;
  formFieldsByForm: Record<string, WeeklyPulseFormField[]>;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  reconnectUrl: string;
  onRetrySources: () => void;
}) {
  const hasAnySource = checkinsEventIds.length > 0 || groupIds.length > 0 || forms.some((row) => row.formId);
  const hasRecipients = recipients.split(/[,\n]/).map((email) => email.trim()).some(Boolean);
  return (
    <div className="mt-4 space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="max-w-sm space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Report name</Label>
        <Input id={`${idPrefix}-name`} value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="flex items-center gap-3">
        <Switch id={`${idPrefix}-enabled`} checked={enabled} onCheckedChange={setEnabled} />
        <Label htmlFor={`${idPrefix}-enabled`}>Send automatically every Monday morning</Label>
      </div>

      <div className="max-w-lg space-y-2">
        <Label htmlFor={`${idPrefix}-recipients`}>Recipient emails</Label>
        <Textarea
          id={`${idPrefix}-recipients`}
          value={recipients}
          onChange={(event) => setRecipients(event.target.value)}
          placeholder="pastor@transformchurch.app, admin@transformchurch.app"
          rows={2}
        />
        <p className="text-xs text-muted-foreground">Separate multiple addresses with commas or new lines.</p>
      </div>

      {sourcesLoading && <p className="text-sm text-muted-foreground">Loading Planning Center events, groups, and forms…</p>}

      {sources && (
        <>
          <div className="space-y-2">
            <Label>Check-Ins events</Label>
            {!sources.checkinsEvents.length && <p className="text-xs text-muted-foreground">No Check-Ins events found.</p>}
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {sources.checkinsEvents.map((event) => (
                <label key={event.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-background">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={checkinsEventIds.includes(event.id)}
                    onChange={(e) => onToggleCheckinsEvent(event.id, e.target.checked)}
                  />
                  {event.name}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Groups</Label>
            {sources.groupsError ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                <p>{sources.groupsError}</p>
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" onClick={() => window.location.assign(reconnectUrl)}>Reconnect Church Center</Button>
                  <Button type="button" size="sm" variant="outline" onClick={onRetrySources}>Retry</Button>
                </div>
              </div>
            ) : (
              !sources.groups.length && <p className="text-xs text-muted-foreground">No Planning Center groups found.</p>
            )}
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {sources.groups.map((group) => (
                <label key={group.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-background">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={groupIds.includes(group.id)}
                    onChange={(e) => onToggleGroup(group.id, e.target.checked)}
                  />
                  {group.name}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Planning Center forms (optional)</Label>
            {sources.formsError && <p className="text-xs text-amber-800">{sources.formsError}</p>}
            {forms.length === 0 && (
              <p className="text-xs text-muted-foreground">No forms added. A form contributes a submission count, optionally broken down by one field.</p>
            )}
            <div className="space-y-3">
              {forms.map((row, index) => (
                <div key={index} className="grid items-end gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="space-y-2">
                    <Label htmlFor={`${idPrefix}-form-${index}`}>Form</Label>
                    <select
                      id={`${idPrefix}-form-${index}`}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={row.formId}
                      onChange={(event) => onFormIdChange(index, event.target.value)}
                    >
                      <option value="">Select a form</option>
                      {sources.forms.map((form) => (
                        <option key={form.id} value={form.id}>{form.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${idPrefix}-form-field-${index}`}>Breakdown field (optional)</Label>
                    <select
                      id={`${idPrefix}-form-field-${index}`}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={row.fieldId}
                      onChange={(event) => onFieldIdChange(index, event.target.value)}
                      disabled={!row.formId}
                    >
                      <option value="">Just a total count</option>
                      {(formFieldsByForm[row.formId] ?? []).map((field) => (
                        <option key={field.id} value={field.id}>{field.label}</option>
                      ))}
                    </select>
                  </div>
                  <Button type="button" size="icon" variant="ghost" onClick={() => onRemoveForm(index)} aria-label="Remove form">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={onAddForm}>
              <Plus className="mr-2 h-4 w-4" /> Add form
            </Button>
          </div>
        </>
      )}

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={saving || !hasRecipients || !hasAnySource}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      {!hasAnySource && (
        <p className="text-xs text-muted-foreground">Select at least one Check-Ins event, group, or form.</p>
      )}
    </div>
  );
}