import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { BarChart3, Check, Download, Loader2, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api, BASE } from "@/lib/toolApi";
import { FIELD_OPTIONS, type AvailableField, type ReportFieldKey } from "@/lib/reportFields";

type EventOption = { id: string; name: string; frequency: string };
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
type PreparationProgress = {
  stage: "loading" | "profiles" | "complete" | "failed";
  completedBatches: number;
  totalBatches: number;
  message: string;
};

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
  const [planningCenterFields, setPlanningCenterFields] = useState<AvailableField[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [eventId, setEventId] = useState("");
  const [startDate, setStartDate] = useState(defaultDate(-30));
  const [endDate, setEndDate] = useState(defaultDate(0));
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [prepared, setPrepared] = useState<PreparedRun | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [preparing, setPreparing] = useState(false);
  // Belt-and-suspenders against double-submitting "Pull and prepare data":
  // the button's `disabled={preparing}` doesn't stop two click events that
  // both fire before React gets a chance to re-render with the updated
  // state (a fast double-click, or a double-tap on touch) -- each one would
  // start its own PCO pull + Python cleanup run on the single shared
  // container, and the two compete for the same CPU/pool, slowing each
  // other down enough to blow through the cleanup timeout that would have
  // been comfortably met running alone. A ref is checked synchronously
  // (unlike state, which only updates on the next render) so the second
  // call bails out immediately instead of slipping through.
  const preparingRef = useRef(false);
  const [preparationProgress, setPreparationProgress] = useState<PreparationProgress | null>(null);
  const [generating, setGenerating] = useState<"pdf" | null>(null);
  // Step 3: email the finished PDF automatically once data is prepared.
  // Recipients start as the signed-in user's own address.
  const [emailReportWhenReady, setEmailReportWhenReady] = useState(true);
  const [reportRecipients, setReportRecipients] = useState("");
  const reportRecipientsTouched = useRef(false);
  const [emailingReport, setEmailingReport] = useState(false);
  const [reportEmailStatus, setReportEmailStatus] = useState("");
  const fieldByKey = useMemo(
    () => new Map([...FIELD_OPTIONS, ...planningCenterFields].map((field) => [field.key, field])),
    [planningCenterFields],
  );
  const activeTemplate = useMemo(
    () => templates.find((template) => String(template.id) === selectedTemplate),
    [templates, selectedTemplate],
  );

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

  const reconnectUrl = useMemo(() => {
    const returnTo = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/reporting`;
    return `${BASE}/api/auth/planning-center/start?return_to=${encodeURIComponent(returnTo)}`;
  }, []);

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
    // Labels for custom Planning Center fields in the CSV column order; the
    // built-in labels still show if this fails.
    api("/api/reports/fields")
      .then(async (response) => setPlanningCenterFields(((await response.json()) as { planningCenterFields: AvailableField[] }).planningCenterFields))
      .catch(() => {});
    loadEvents();
    loadTemplates().catch((error) => {
      toast({ title: "Could not load report templates", description: error.message, variant: "destructive" });
    });
  }, []);

  useEffect(() => {
    if (!reportRecipientsTouched.current && me?.email) setReportRecipients(me.email);
  }, [me?.email]);

  const emailReportPdf = async (run: PreparedRun) => {
    const recipients = reportRecipients.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
    if (!recipients.length) {
      toast({ title: "No email recipients", description: "Add at least one address in step 3.", variant: "destructive" });
      return;
    }
    setEmailingReport(true);
    setReportEmailStatus("Creating the PDF and emailing it…");
    try {
      const response = await api("/api/reports/email-pdf", {
        method: "POST",
        body: JSON.stringify({ runId: run.runId, templateId: Number(selectedTemplate), recipients }),
      });
      const result = await response.json() as { recipients: string[] };
      const sentTo = result.recipients.join(", ");
      setReportEmailStatus(`Emailed to ${sentTo} at ${new Date().toLocaleTimeString()}.`);
      toast({ title: "Report emailed", description: `The PDF was sent to ${sentTo}.` });
    } catch (error) {
      setReportEmailStatus("");
      toast({ title: "Could not email the report", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setEmailingReport(false);
    }
  };

  const prepare = async () => {
    if (!eventId || !endDate || !selectedTemplate || (activeTemplate?.cleanupMode === "all_dates" && !startDate)) return;
    if (preparingRef.current) return; // already running -- see preparingRef comment above
    if (emailReportWhenReady && !reportRecipients.trim()) {
      toast({ title: "No email recipients", description: "Add an address in step 3, or turn off emailing.", variant: "destructive" });
      return;
    }
    preparingRef.current = true;
    setReportEmailStatus("");
    const progressId = crypto.randomUUID();
    let progressTimer: number | undefined;
    setPreparing(true);
    setPrepared(null);
    setPreparationProgress({
      stage: "loading",
      completedBatches: 0,
      totalBatches: 0,
      message: "Loading attendance data…",
    });
    try {
      progressTimer = window.setInterval(async () => {
        try {
          const response = await api(`/api/reports/prepare-progress/${encodeURIComponent(progressId)}`);
          setPreparationProgress(await response.json() as PreparationProgress);
        } catch {
          // The main preparation request reports actionable errors.
        }
      }, 750);
      const response = await api("/api/reports/prepare", {
        method: "POST",
        body: JSON.stringify({
          progressId,
          eventId,
          startDate: activeTemplate?.cleanupMode === "all_dates" ? startDate : undefined,
          endDate,
          templateId: Number(selectedTemplate),
        }),
      });
      const result = await response.json() as PreparedRun;
      setPrepared(result);
      toast({ title: "Attendance data cleaned", description: `${result.peopleCount} people are ready for the report.` });
      if (emailReportWhenReady) await emailReportPdf(result);
    } catch (error) {
      toast({ title: "Could not prepare report", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      if (progressTimer !== undefined) window.clearInterval(progressTimer);
      preparingRef.current = false;
      setPreparing(false);
      setPreparationProgress(null);
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

  const download = async (format: "pdf") => {
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          <BarChart3 className="h-8 w-8 text-primary" /> Reporting
        </h1>
        <p className="mt-2 text-muted-foreground">
          Export Planning Center Check-Ins attendance into an approved report template.
        </p>
        {isAdmin && (
          <p className="mt-1 text-sm text-muted-foreground">
            Report templates, scripts, Weekly Pulse and access are managed in{" "}
            <Link href="/admin/tools" className="text-primary underline underline-offset-2">Tool Management</Link>.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <StepNumber number={1} active={!prepared} complete={!!prepared} />
            Select attendance cutoff
          </CardTitle>
        </CardHeader>
        <CardContent className={`grid gap-4 ${activeTemplate?.cleanupMode === "all_dates" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
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
          {activeTemplate?.cleanupMode === "all_dates" && (
            <div className="space-y-2">
              <Label htmlFor="report-start">Start date</Label>
              <Input id="report-start" type="date" value={startDate} max={endDate} onChange={(event) => { setStartDate(event.target.value); setPrepared(null); }} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="report-end">End date</Label>
            <Input id="report-end" type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPrepared(null); }} />
            <p className="text-xs text-muted-foreground">
              {activeTemplate?.cleanupMode === "all_dates"
                ? "All Planning Center sessions in the selected date range are included."
                : "The selected template determines how many previous Planning Center sessions are included."}
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
            <Label htmlFor="report-template">Report template</Label>
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
              {activeTemplate?.pullFields
                .map((key) => fieldByKey.get(key)?.label ?? key)
                .filter(Boolean)
                .join(" → ")}
              <span className="mt-1 block text-muted-foreground">
                {activeTemplate?.cleanupMode === "all_dates"
                  ? "Attendance: All sessions in the selected date range"
                  : `Sessions: ${activeTemplate?.sessionCount ?? 5}`}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <StepNumber number={3} active={!!selectedTemplate && !prepared} complete={!!reportEmailStatus || (!!selectedTemplate && !emailReportWhenReady)} />
            Email the finished report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={emailReportWhenReady}
              onChange={(event) => setEmailReportWhenReady(event.target.checked)}
            />
            Email the PDF automatically when step 4 finishes
          </label>
          <div className="max-w-lg space-y-2">
            <Label htmlFor="report-recipients">Send to</Label>
            <Input
              id="report-recipients"
              type="text"
              inputMode="email"
              placeholder="name@transformchurch.com, another@transformchurch.com"
              value={reportRecipients}
              disabled={!emailReportWhenReady}
              onChange={(event) => { reportRecipientsTouched.current = true; setReportRecipients(event.target.value); }}
            />
            <p className="text-xs text-muted-foreground">
              Separate addresses with commas (up to 10). The report lists attendees by name, including kids, so only send it to the team.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <StepNumber number={4} active={!!selectedTemplate} complete={!!prepared} />
            Pull, review, and download
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pull the fields configured for this template, merge duplicate check-ins, and format the CSV in the saved column order.
            {emailReportWhenReady ? " The PDF is then emailed to the people in step 3." : ""}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={prepare}
              disabled={preparing || !eventId || !selectedTemplate || !!eventsError || (activeTemplate?.cleanupMode === "all_dates" && (!startDate || startDate > endDate))}
            >
              {preparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {preparing ? "Pulling and formatting data…" : "Pull and prepare data"}
            </Button>
            {preparing && preparationProgress && (
              <span className="text-sm text-muted-foreground" role="status" aria-live="polite">
                {preparationProgress.message}
              </span>
            )}
          </div>
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
            <Button variant="outline" onClick={() => download("pdf")} disabled={!prepared || !selectedTemplate || !!generating}>
              {generating === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download PDF
            </Button>
            <Button variant="outline" onClick={() => prepared && emailReportPdf(prepared)} disabled={!prepared || !selectedTemplate || emailingReport || !reportRecipients.trim()}>
              {emailingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Email PDF
            </Button>
          </div>
          {(emailingReport || reportEmailStatus) && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
              {emailingReport && <Loader2 className="h-4 w-4 animate-spin" />}
              {reportEmailStatus}
            </p>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
