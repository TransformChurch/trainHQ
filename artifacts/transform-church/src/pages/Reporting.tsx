import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { BarChart3, Check, Download, Loader2, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api, BASE } from "@/lib/toolApi";
import { FIELD_OPTIONS, type AvailableField, type ReportFieldKey } from "@/lib/reportFields";
import { defaultPeriodKind, formatRange, localToday, previousPeriod } from "@/lib/reportPeriods";

type EventOption = { id: string; name: string; frequency: string; archived?: boolean };
type CleanupMode = "month_quarter" | "all_dates";
// How a Monthly/Quarterly template picks its sessions: a whole calendar
// month/quarter (default, so 4- and 5-week months both come out right), a
// custom date range, or the template's last N weeks (the old behavior).
type PeriodMode = "month" | "quarter" | "custom" | "sessions";
type ReportEngine = "youth_quarterly" | "youth_monthly" | "kids_rutherford" | "kids_lyndhurst" | "kids_rutherford_quarterly" | "kids_lyndhurst_quarterly"
  | "season_young_adults" | "season_groups";
// Season reports (2026-10-15) can read attendance from Check-Ins events or
// from Planning Center Groups.
type AttendanceSource = "checkins" | "groups";
type GroupOption = { id: string; name: string; groupType: string; archived: boolean; createdAt: string | null };
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
  skippedDates?: string[];
  seasonLabel?: string;
  weekLabels?: Record<string, string>;
  unmatchedWeekLabels?: string[];
  startDate?: string;
  endDate?: string;
  notes?: string[];
};
type PreparationProgress = {
  stage: "loading" | "profiles" | "complete" | "failed";
  completedBatches: number;
  totalBatches: number;
  message: string;
};

const INCLUDE_MAP_KEY = "tc-reporting-include-map";

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
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [eventFilter, setEventFilter] = useState("");
  // Archived Check-Ins events (past seasons) are listed only when asked for.
  const [showArchivedEvents, setShowArchivedEvents] = useState(false);
  const [startDate, setStartDate] = useState(defaultDate(-30));
  const [endDate, setEndDate] = useState(defaultDate(0));
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [source, setSource] = useState<AttendanceSource>("checkins");
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState("");
  const [showArchivedGroups, setShowArchivedGroups] = useState(false);
  // Groups are recreated every season, so by default a Groups report covers
  // every meeting the chosen groups had (their own dates).
  const [useGroupDates, setUseGroupDates] = useState(true);
  const [seasonLabel, setSeasonLabel] = useState("");
  const [weekLabelsText, setWeekLabelsText] = useState("");
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
  // Optional last PDF page: a Northern NJ map of where attendees live
  // (2026-10-21). Remembered per browser.
  const [includeMap, setIncludeMap] = useState(() => {
    try {
      return window.localStorage.getItem(INCLUDE_MAP_KEY) === "1";
    } catch {
      return false;
    }
  });
  const changeIncludeMap = (value: boolean) => {
    setIncludeMap(value);
    try {
      window.localStorage.setItem(INCLUDE_MAP_KEY, value ? "1" : "0");
    } catch {
      // Storage unavailable (private window): the choice just isn't remembered.
    }
  };
  const fieldByKey = useMemo(
    () => new Map([...FIELD_OPTIONS, ...planningCenterFields].map((field) => [field.key, field])),
    [planningCenterFields],
  );
  const activeTemplate = useMemo(
    () => templates.find((template) => String(template.id) === selectedTemplate),
    [templates, selectedTemplate],
  );

  const isSeason = !!activeTemplate?.engine?.startsWith("season_");
  // Only season templates can read Planning Center Groups.
  const fromGroups = isSeason && source === "groups";
  const isAllDates = activeTemplate?.cleanupMode === "all_dates" || isSeason;
  // Calendar-period modes send a start + end date; "sessions" keeps the
  // template's last-N-sessions behavior. A Groups report on the groups' own
  // dates sends no dates at all.
  const usesRange = fromGroups ? !useGroupDates : isAllDates || periodMode !== "sessions";
  const hasSource = fromGroups ? groupIds.length > 0 : eventIds.length > 0;
  const datesValid = fromGroups
    ? useGroupDates || (!!startDate && !!endDate && startDate <= endDate)
    : !!endDate && (!usesRange || (!!startDate && startDate <= endDate));

  const choosePeriod = (mode: PeriodMode) => {
    setPeriodMode(mode);
    setPrepared(null);
    if (mode === "month" || mode === "quarter") {
      const period = previousPeriod(mode, localToday());
      setStartDate(period.startDate);
      setEndDate(period.endDate);
    }
  };

  // Each template defaults to the period it reports on: quarterly engines
  // the previous quarter, everything else the previous month.
  useEffect(() => {
    if (!activeTemplate || activeTemplate.cleanupMode === "all_dates" || activeTemplate.engine?.startsWith("season_")) return;
    choosePeriod(defaultPeriodKind(activeTemplate.engine));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTemplate?.id]);

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
      const response = await api("/api/reports/events?archived=include");
      const rows = await response.json() as EventOption[];
      setEvents(rows);
      const firstActive = rows.find((row) => !row.archived) ?? rows[0];
      setEventIds((current) => (current.length ? current : firstActive ? [firstActive.id] : []));
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

  const loadGroups = async () => {
    setGroupsLoading(true);
    setGroupsError("");
    try {
      const response = await api("/api/reports/groups");
      setGroups(await response.json() as GroupOption[]);
    } catch (error) {
      setGroupsError(error instanceof Error ? error.message : "Could not load groups.");
    } finally {
      setGroupsLoading(false);
    }
  };

  useEffect(() => {
    if (fromGroups && !groups.length && !groupsLoading && !groupsError) loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromGroups]);

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
        body: JSON.stringify({ runId: run.runId, templateId: Number(selectedTemplate), recipients, includeMap }),
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
    if (!hasSource || !selectedTemplate || !datesValid) return;
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
          ...(fromGroups ? { source: "groups", groupIds } : { eventIds }),
          startDate: usesRange ? startDate : undefined,
          period: !fromGroups && !isAllDates && periodMode !== "sessions" ? "range" : undefined,
          endDate: fromGroups && !usesRange ? undefined : endDate,
          templateId: Number(selectedTemplate),
          ...(isSeason ? { seasonLabel: seasonLabel.trim() || undefined, weekLabels: weekLabelsText } : {}),
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
        body: JSON.stringify({ runId: prepared.runId, templateId: Number(selectedTemplate), format, includeMap }),
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
        <CardContent className="grid gap-4 md:grid-cols-3">
          {isSeason && (
            <div className="space-y-2 md:col-span-full">
              <Label>Attendance from</Label>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {([["checkins", "Check-Ins event"], ["groups", "Planning Center Groups"]] as const).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={source === value ? "default" : "outline"}
                    role="radio"
                    aria-checked={source === value}
                    onClick={() => { setSource(value); setPrepared(null); }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Young Adults tracks attendance with Check-Ins; most other Transform groups take attendance in Planning Center Groups.
              </p>
            </div>
          )}
          {fromGroups && (
            <div className="space-y-2 md:col-span-full">
              <Label htmlFor="report-group-filter">
                Groups{groupIds.length > 1 ? ` (${groupIds.length} combined into one report)` : ""}
              </Label>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  id="report-group-filter"
                  className="max-w-sm"
                  placeholder="Search groups or group types…"
                  value={groupFilter}
                  onChange={(event) => setGroupFilter(event.target.value)}
                  disabled={groupsLoading || !!groupsError}
                />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={showArchivedGroups} onCheckedChange={(checked) => setShowArchivedGroups(checked === true)} />
                  Show archived (past seasons)
                </label>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {groups
                  .filter((group) => groupIds.includes(group.id) || (
                    (showArchivedGroups || !group.archived)
                    && `${group.name} ${group.groupType}`.toLowerCase().includes(groupFilter.trim().toLowerCase())
                  ))
                  .map((group) => (
                    <label key={group.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
                      <Checkbox
                        checked={groupIds.includes(group.id)}
                        onCheckedChange={(checked) => {
                          setGroupIds((current) => (checked === true ? [...current, group.id] : current.filter((id) => id !== group.id)));
                          setPrepared(null);
                        }}
                      />
                      <span>{group.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {[group.groupType, group.archived ? "archived" : ""].filter(Boolean).join(" · ")}
                      </span>
                    </label>
                  ))}
                {!groupsLoading && !groupsError && !groups.length && (
                  <p className="px-1 py-1 text-sm text-muted-foreground">No groups found.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Pick one group, or several to combine them (for example every group from one season). People marked present in
                any of them count; meetings on the same date share a column.
              </p>
              {groupsLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading Planning Center groups…</p>}
              {groupsError && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  <p className="font-medium">Groups access is required</p>
                  <p className="mt-1">{groupsError}</p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => window.location.assign(reconnectUrl)}>Reconnect Church Center</Button>
                    <Button size="sm" variant="outline" onClick={loadGroups}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {fromGroups && (
            <div className="space-y-2 md:col-span-full">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={useGroupDates} onCheckedChange={(checked) => { setUseGroupDates(checked === true); setPrepared(null); }} />
                Use the groups' own dates (every meeting they've had)
              </label>
              <p className="text-xs text-muted-foreground">
                Turn this off to report on a specific date range instead.
              </p>
            </div>
          )}
          {!fromGroups && (
          <div className="space-y-2 md:col-span-full">
            <Label htmlFor="report-event-filter">
              {showArchivedEvents ? "Events" : "Active events"}{eventIds.length > 1 ? ` (${eventIds.length} joined into one report)` : ""}
            </Label>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                id="report-event-filter"
                className="max-w-sm"
                placeholder="Search events…"
                value={eventFilter}
                onChange={(event) => setEventFilter(event.target.value)}
                disabled={eventsLoading || !!eventsError}
              />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={showArchivedEvents} onCheckedChange={(checked) => setShowArchivedEvents(checked === true)} />
                Show archived events
              </label>
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {events
                .filter((event) => eventIds.includes(event.id) || (
                  (showArchivedEvents || !event.archived)
                  && event.name.toLowerCase().includes(eventFilter.trim().toLowerCase())
                ))
                .map((event) => (
                  <label key={event.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
                    <Checkbox
                      checked={eventIds.includes(event.id)}
                      onCheckedChange={(checked) => {
                        setEventIds((current) => (checked === true ? [...current, event.id] : current.filter((id) => id !== event.id)));
                        setPrepared(null);
                      }}
                      disabled={eventsLoading || !!eventsError}
                    />
                    {event.name}
                    {event.archived && <span className="text-xs text-muted-foreground">archived</span>}
                  </label>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Pick one event, or several to combine them into a single report (their sessions and people are pooled; sessions
              on the same date share a column). Works best for events that meet on the same day.
            </p>
          </div>
          )}
          {!isAllDates && (
            <div className="space-y-2">
              <Label htmlFor="report-period">Report period</Label>
              <select
                id="report-period"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={periodMode}
                onChange={(event) => choosePeriod(event.target.value as PeriodMode)}
              >
                <option value="month">Previous month ({previousPeriod("month", localToday()).label})</option>
                <option value="quarter">Previous quarter ({previousPeriod("quarter", localToday()).label})</option>
                <option value="custom">Custom dates</option>
                <option value="sessions">Last {activeTemplate?.sessionCount ?? 5} weeks up to an end date</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {periodMode === "sessions"
                  ? `The last ${activeTemplate?.sessionCount ?? 5} weeks with a Planning Center session up to the end date. A week nobody checked in to still counts as one of them, but isn't counted in attendance rates.`
                  : periodMode === "custom"
                    ? "Every Planning Center session in the dates you pick is included."
                    : `${formatRange(startDate, endDate)}: every session in the ${periodMode}, whether it had 4 weeks or 5.`}
              </p>
            </div>
          )}
          {(fromGroups ? usesRange : isAllDates || periodMode === "custom") && (
            <div className="space-y-2">
              <Label htmlFor="report-start">{isSeason ? "Season starts" : "Start date"}</Label>
              <Input id="report-start" type="date" value={startDate} max={endDate} onChange={(event) => { setStartDate(event.target.value); setPrepared(null); }} />
            </div>
          )}
          {(fromGroups ? usesRange : isAllDates || periodMode === "custom" || periodMode === "sessions") && (
            <div className="space-y-2">
              <Label htmlFor="report-end">{isSeason ? "Season ends" : "End date"}</Label>
              <Input id="report-end" type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPrepared(null); }} />
              {isAllDates && (
                <p className="text-xs text-muted-foreground">
                  {isSeason
                    ? "Every night in the season's dates is included. A night nobody attended shows as 0 and isn't counted in attendance rates."
                    : "All Planning Center sessions in the selected date range are included."}
                </p>
              )}
            </div>
          )}
          {!fromGroups && eventsLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground md:col-span-3"><Loader2 className="h-4 w-4 animate-spin" /> Loading Planning Center events…</p>}
          {!fromGroups && eventsError && (
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
            <StepNumber number={2} active={hasSource && !selectedTemplate} complete={!!selectedTemplate} />
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
          {isSeason && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="report-season-name">Season name</Label>
                <Input
                  id="report-season-name"
                  placeholder="Winter 2026 (from the first night if blank)"
                  value={seasonLabel}
                  maxLength={60}
                  onChange={(event) => { setSeasonLabel(event.target.value); setPrepared(null); }}
                />
                <p className="text-xs text-muted-foreground">Shown on the cover and every page.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-week-labels">Night names (optional)</Label>
                <Textarea
                  id="report-week-labels"
                  rows={4}
                  placeholder={"1/15 Relationship Panel\n1/22 Worship Night"}
                  value={weekLabelsText}
                  onChange={(event) => { setWeekLabelsText(event.target.value); setPrepared(null); }}
                />
                <p className="text-xs text-muted-foreground">
                  One per line: a date, then the night's name. {fromGroups
                    ? "Meeting names from Planning Center Groups are used when you leave a night out."
                    : "A session note in Check-Ins is used when you leave a night out."}
                </p>
              </div>
            </div>
          )}
          {selectedTemplate && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <span className="font-medium">CSV column order: </span>
              {activeTemplate?.pullFields
                .map((key) => fieldByKey.get(key)?.label ?? key)
                .filter(Boolean)
                .join(" → ")}
              <span className="mt-1 block text-muted-foreground">
                {fromGroups && !usesRange
                  ? "Attendance: every meeting the selected groups have had"
                  : usesRange
                    ? "Attendance: All sessions in the selected date range"
                    : `Weeks: ${activeTemplate?.sessionCount ?? 5}`}
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
              disabled={preparing || !hasSource || !selectedTemplate || (fromGroups ? !!groupsError : !!eventsError) || !datesValid}
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
                <div><span className="block text-muted-foreground">{fromGroups ? "Groups" : "Event"}</span><strong>{prepared.eventName}</strong></div>
                <div><span className="block text-muted-foreground">People</span><strong>{prepared.peopleCount}</strong></div>
                <div><span className="block text-muted-foreground">{fromGroups ? "Marked present" : "Check-ins"}</span><strong>{prepared.rawRows}</strong></div>
                <div><span className="block text-muted-foreground">Review flags</span><strong>{prepared.reviewCount}</strong></div>
              </div>
              <p className="text-xs text-muted-foreground">Fields: {prepared.pullFieldLabels.join(" → ")}</p>
              {prepared.seasonLabel && (
                <p className="text-xs text-muted-foreground">
                  Season: {prepared.seasonLabel}
                  {prepared.startDate && prepared.endDate ? ` (${formatRange(prepared.startDate, prepared.endDate)})` : ""}
                  {prepared.weekLabels && Object.keys(prepared.weekLabels).length > 0 && (
                    <span className="block">
                      Night names: {Object.entries(prepared.weekLabels).sort(([a], [b]) => a.localeCompare(b)).map(([date, name]) => `${date} ${name}`).join(" · ")}
                    </span>
                  )}
                  {!!prepared.unmatchedWeekLabels?.length && (
                    <span className="block text-amber-700">
                      These night names didn't match a night in the report: {prepared.unmatchedWeekLabels.join(" · ")}
                    </span>
                  )}
                </p>
              )}
              {!!prepared.notes?.length && (
                <p className="text-xs text-amber-700">{prepared.notes.join(" ")}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Weeks ({prepared.sessionCount}): {prepared.serviceDates.join(", ")}
                {!!prepared.skippedDates?.length && (
                  <span className="block">
                    Weeks off (nobody checked in; shown as 0, not counted in attendance rates): {prepared.skippedDates.join(", ")}
                  </span>
                )}
              </p>
              {prepared.reviewCount > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Review cleanup flags</summary>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs">{prepared.flags}</pre>
                </details>
              )}
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <Checkbox className="mt-0.5" checked={includeMap} onCheckedChange={(checked) => changeIncludeMap(checked === true)} />
            <span>
              Add a map page of where attendees live
              <span className="block text-xs text-muted-foreground">
                Last page of the PDF: Northern NJ ZIP codes shaded by how many attendees live in each, from their home address in Planning Center.
              </span>
            </span>
          </label>
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
