import { useEffect, useMemo, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { BarChart3, Check, Download, FileSpreadsheet, Loader2, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? import.meta.env.BASE_URL.replace(/\/$/, "");
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type EventOption = { id: string; name: string; frequency: string };
type ReportTemplate = { id: number; name: string; originalFileName: string; createdAt: string };
type PreparedRun = {
  runId: string;
  eventName: string;
  rawRows: number;
  peopleCount: number;
  serviceDates: string[];
  reviewCount: number;
  flags: string;
  expiresAt: string;
};

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
  const [startDate, setStartDate] = useState(defaultDate(-30));
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

  const reconnectUrl = useMemo(() => {
    const returnTo = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/reporting`;
    return `${BASE}/api/auth/planning-center/start?return_to=${encodeURIComponent(returnTo)}`;
  }, []);

  const loadTemplates = async () => {
    const response = await api("/api/reports/templates");
    const rows = await response.json() as ReportTemplate[];
    setTemplates(rows);
    setSelectedTemplate((current) => current || (rows[0]?.id ? String(rows[0].id) : ""));
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

  useEffect(() => {
    loadEvents();
    loadTemplates().catch((error) => {
      toast({ title: "Could not load report templates", description: error.message, variant: "destructive" });
    });
  }, []);

  const { uploadFile, isUploading } = useUpload({
    basePath: `${BASE}/api/storage`,
    getAuthToken: () => sessionStorage.getItem("auth_bearer_token"),
  });

  const prepare = async () => {
    if (!eventId || !startDate || !endDate) return;
    setPreparing(true);
    setPrepared(null);
    try {
      const response = await api("/api/reports/prepare", {
        method: "POST",
        body: JSON.stringify({ eventId, startDate, endDate }),
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
            Select attendance
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
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
            <Label htmlFor="report-start">Start date</Label>
            <Input id="report-start" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPrepared(null); }} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-end">End date</Label>
            <Input id="report-end" type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPrepared(null); }} />
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
            <StepNumber number={2} active={!prepared} complete={!!prepared} />
            Clean and review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pull attendee names, ages, grades, first-timer status, phones, and emails, then merge duplicates and flag data that needs review.
          </p>
          <Button onClick={prepare} disabled={preparing || !eventId || !!eventsError}>
            {preparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {preparing ? "Cleaning attendance…" : "Pull and clean attendance"}
          </Button>
          {prepared && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div className="grid gap-3 text-sm sm:grid-cols-4">
                <div><span className="block text-muted-foreground">Event</span><strong>{prepared.eventName}</strong></div>
                <div><span className="block text-muted-foreground">People</span><strong>{prepared.peopleCount}</strong></div>
                <div><span className="block text-muted-foreground">Check-ins</span><strong>{prepared.rawRows}</strong></div>
                <div><span className="block text-muted-foreground">Review flags</span><strong>{prepared.reviewCount}</strong></div>
              </div>
              <p className="text-xs text-muted-foreground">Service dates: {prepared.serviceDates.join(", ")}</p>
              {prepared.reviewCount > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Review cleanup flags</summary>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs">{prepared.flags}</pre>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <StepNumber number={3} active={!!prepared} complete={false} />
            Build and download
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-lg space-y-2">
            <Label htmlFor="report-template">Excel template</Label>
            <select
              id="report-template"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedTemplate}
              onChange={(event) => setSelectedTemplate(event.target.value)}
            >
              {!templates.length && <option value="">No templates available</option>}
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-3">
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
                <div key={template.id} className="flex items-center justify-between gap-4 p-3">
                  <div><p className="font-medium">{template.name}</p><p className="text-xs text-muted-foreground">{template.originalFileName}</p></div>
                  <Button size="icon" variant="ghost" onClick={() => removeTemplate(template)} aria-label={`Delete ${template.name}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}