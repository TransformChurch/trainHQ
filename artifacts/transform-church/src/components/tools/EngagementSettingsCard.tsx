import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Gauge, Loader2, Mail, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/toolApi";

// Tool Management > Engagement tab: the engagement score's points (out of 17
// by default; used by the reports' Discipleship page and the Engagement
// tool), which people-sync fields hold Thrive / Serve Class / Last Served /
// Giving / Leadership, forms that don't count, the tracked events, groups and
// group types (Transform or TC College) plus the Monday email
// (routes/engagement.ts).

type Part = "formThrive" | "transform" | "serving" | "tcCollege" | "giving" | "leadership" | "serveClass";
type Kind = "checkins_event" | "group" | "group_type" | "checkins_master" | "group_master";
type Role = "transform" | "tc_college";
type TrackedEvent = { id: string; name: string };
type TrackedItem = { kind: Kind; id: string; name: string; role: Role; extraEvents?: TrackedEvent[] };
type FormInfo = { id: string; name: string; archived: boolean; submissionCount: number };
type SyncRun = { status: string; startedAt: string; finishedAt: string | null; itemsChecked: number; weeksSaved: number; failures: { item: string; error: string }[]; message?: string };
type Settings = {
  points: Record<Part, number>;
  fields: { thrive?: string | null; serveClass?: string | null; lastServed?: string | null; giving?: string | null; leadership?: string | null };
  servingWindowDays: number;
  tiers: { green: number; yellow: number };
  missedGivingDays: number;
  excludedFormIds: string[];
  dashboard: { items: TrackedItem[]; recipients: string[]; emailEnabled: boolean; defaultWeeks: number; ownerName: string };
};
type SettingsResponse = {
  settings: Settings;
  resolvedFields: { thrive: string | null; serveClass: string | null; lastServed: string | null; giving: string | null; leadership: string | null };
  maxPoints: number;
  forms: FormInfo[];
  formsSyncedAt: string | null;
  syncedFields: { key: string; label: string }[];
  weekOptions: number[];
  syncState: Record<string, { pulledFrom: string; lastSyncedAt: string } | null>;
  lastSync: SyncRun | null;
};
type Sources = { checkinsEvents: { id: string; name: string; archived?: boolean; archivedAt?: string | null }[]; groups: { id: string; name: string }[]; groupTypes: { id: string; name: string; description: string }[]; checkinMasters?: { id: string; name: string; eventCount: number }[]; groupMasters?: { id: string; name: string; eventCount: number }[] };

const PARTS: { key: Part; label: string; help: string }[] = [
  { key: "formThrive", label: "Form / Thrive", help: "Thrive done, or any form submitted" },
  { key: "transform", label: "Transform", help: "× attendance rate (partial)" },
  { key: "serving", label: "Serving", help: "Last Served within the window" },
  { key: "tcCollege", label: "TC College", help: "checked in, last 26 weeks" },
  { key: "giving", label: "Giving", help: "Giving field has a value" },
  { key: "leadership", label: "Leadership", help: "Leadership field has a value" },
  { key: "serveClass", label: "Serve Class", help: "completed Serve Class" },
];
const FIELD_ROWS: { key: "thrive" | "serveClass" | "lastServed"; label: string }[] = [
  { key: "thrive", label: "Thrive" },
  { key: "serveClass", label: "Serve Class" },
  { key: "lastServed", label: "Last Served" },
];
const ROLE_LABEL: Record<Role, string> = { transform: "Transform", tc_college: "TC College" };
const KIND_LABEL: Record<Kind, string> = { checkins_event: "Check-Ins event", group: "Group", group_type: "Group type (every group of this type)", checkins_master: "Check-In master (approved events)", group_master: "Group master (approved groups)" };
const MAX_EVENTS_PER_ITEM = 20;
const itemKeyOf = (item: Pick<TrackedItem, "kind" | "id">) => `${item.kind}:${item.id}`;
const roleFor = (name: string): Role => (/college/i.test(name) ? "tc_college" : "transform");
const selectClass = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm";

export function EngagementSettingsCard() {
  const { toast } = useToast();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [recipientsText, setRecipientsText] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sources, setSources] = useState<Sources | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState("");
  const [pickKind, setPickKind] = useState<Kind>("group_type");
  const [filter, setFilter] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showForms, setShowForms] = useState(false);
  // Check-Ins picker: several events at once, archived ones optional, and
  // adding to an existing card (addTarget = that card's key).
  const [showArchived, setShowArchived] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [addTarget, setAddTarget] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const pollTimer = useRef<number | null>(null);

  const load = async (resetDraft = true) => {
    try {
      const response = await api("/api/engagement/settings");
      const next = await response.json() as SettingsResponse;
      setData(next);
      if (resetDraft) {
        setDraft(next.settings);
        setRecipientsText(next.settings.dashboard.recipients.join(", "));
      }
      setLoadError("");
      return next;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Request failed.");
      return null;
    }
  };

  useEffect(() => {
    load();
    return () => { if (pollTimer.current) window.clearTimeout(pollTimer.current); };
  }, []);

  const loadSources = async () => {
    if (sources || sourcesLoading) return;
    setSourcesLoading(true);
    setSourcesError("");
    try {
      const response = await api("/api/engagement/sources");
      setSources(await response.json() as Sources);
    } catch (error) {
      setSourcesError(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setSourcesLoading(false);
    }
  };

  const options = useMemo(() => {
    if (!sources || !draft) return [];
    const needle = filter.trim().toLowerCase();
    if (pickKind === "checkins_event") {
      // An event can only be on one card.
      const used = new Set(draft.dashboard.items.filter((item) => item.kind === "checkins_event")
        .flatMap((item) => [item.id, ...(item.extraEvents ?? []).map((event) => event.id)]));
      return sources.checkinsEvents
        .filter((entry) => !used.has(entry.id) && (showArchived || !entry.archived) && (!needle || entry.name.toLowerCase().includes(needle)))
        .sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || a.name.localeCompare(b.name))
        .slice(0, 150);
    }
    const list = pickKind === "group" ? sources.groups
      : pickKind === "checkins_master" ? sources.checkinMasters ?? []
      : pickKind === "group_master" ? sources.groupMasters ?? []
      : sources.groupTypes;
    const tracked = new Set(draft.dashboard.items.map((item) => `${item.kind}:${item.id}`));
    return list.filter((entry) => !tracked.has(`${pickKind}:${entry.id}`) && (!needle || entry.name.toLowerCase().includes(needle))).slice(0, 60);
  }, [sources, draft, pickKind, filter, showArchived]);

  if (loadError) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" /> Engagement score &amp; dashboard</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-destructive">{loadError}</p></CardContent>
      </Card>
    );
  }
  if (!data || !draft) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" /> Engagement score &amp; dashboard</CardTitle></CardHeader>
        <CardContent><p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p></CardContent>
      </Card>
    );
  }

  const setPoints = (part: Part, value: string) => setDraft({ ...draft, points: { ...draft.points, [part]: Math.min(20, Math.max(0, Number(value) || 0)) } });
  const draftTotal = Math.round(Object.values(draft.points).reduce((sum, value) => sum + value, 0) * 10) / 10;
  const pointsChanged = (Object.keys(draft.points) as Part[]).some((part) => draft.points[part] !== data.settings.points[part]);
  const tcTracked = draft.dashboard.items.some((item) => item.role === "tc_college");
  const notSetUp: Record<Part, string | null> = {
    formThrive: null,
    transform: null,
    serving: data.resolvedFields.lastServed || draft.fields.lastServed ? null : "No Last Served field in the people sync.",
    tcCollege: tcTracked ? null : "Add the TC College event below and mark it TC College.",
    giving: draft.fields.giving ? null : "Pick a Giving field below.",
    leadership: draft.fields.leadership ? null : "Pick a Leadership field below.",
    serveClass: data.resolvedFields.serveClass || draft.fields.serveClass ? null : "No Serve Class field in the people sync.",
  };
  const excluded = new Set(draft.excludedFormIds);
  const toggleForm = (id: string) => setDraft({
    ...draft,
    excludedFormIds: excluded.has(id) ? draft.excludedFormIds.filter((entry) => entry !== id) : [...draft.excludedFormIds, id],
  });
  const setDashboard = (patch: Partial<Settings["dashboard"]>) => setDraft({ ...draft, dashboard: { ...draft.dashboard, ...patch } });
  const eventName = (id: string) => sources?.checkinsEvents.find((event) => event.id === id)?.name ?? id;
  const targetItem = addTarget ? draft.dashboard.items.find((item) => itemKeyOf(item) === addTarget) ?? null : null;
  const targetRoom = targetItem ? MAX_EVENTS_PER_ITEM - 1 - (targetItem.extraEvents?.length ?? 0) : MAX_EVENTS_PER_ITEM;
  const togglePicked = (id: string) => setPicked(picked.includes(id) ? picked.filter((entry) => entry !== id) : picked.length >= targetRoom ? picked : [...picked, id]);
  const finishPicking = () => { setPicked([]); setAddTarget(null); };
  // Several picked events become one card; the first one is its main event.
  const addCombined = () => {
    if (!picked.length) return;
    const [first, ...rest] = picked;
    const name = eventName(first);
    setDashboard({ items: [...draft.dashboard.items, {
      kind: "checkins_event", id: first, name, role: roleFor(name),
      ...(rest.length ? { extraEvents: rest.map((id) => ({ id, name: eventName(id) })) } : {}),
    }] });
    finishPicking();
  };
  const addSeparately = () => {
    setDashboard({ items: [...draft.dashboard.items, ...picked.map((id) => ({ kind: "checkins_event" as Kind, id, name: eventName(id), role: roleFor(eventName(id)) }))] });
    finishPicking();
  };
  const addToTarget = () => {
    if (!targetItem || !picked.length) return;
    setDashboard({ items: draft.dashboard.items.map((item) => itemKeyOf(item) !== addTarget ? item : {
      ...item, extraEvents: [...(item.extraEvents ?? []), ...picked.map((id) => ({ id, name: eventName(id) }))],
    }) });
    finishPicking();
  };
  const startAddingTo = (key: string) => {
    setAddTarget(key);
    setPicked([]);
    setPickKind("checkins_event");
    loadSources();
    pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const removeEvent = (key: string, eventId: string) => setDashboard({ items: draft.dashboard.items.map((item) => itemKeyOf(item) !== key ? item : {
    ...item, extraEvents: (item.extraEvents ?? []).filter((event) => event.id !== eventId),
  }) });
  const fieldLabel = (key: string | null) => data.syncedFields.find((field) => field.key === key)?.label ?? null;

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/engagement/settings", {
        method: "PUT",
        body: JSON.stringify({
          points: draft.points,
          fields: draft.fields,
          excludedFormIds: draft.excludedFormIds,
          servingWindowDays: draft.servingWindowDays,
          tiers: draft.tiers,
          missedGivingDays: draft.missedGivingDays,
          dashboard: {
            items: draft.dashboard.items,
            recipients: recipientsText,
            emailEnabled: draft.dashboard.emailEnabled,
            defaultWeeks: draft.dashboard.defaultWeeks,
          },
        }),
      });
      toast({ title: "Engagement settings saved" });
      await load();
    } catch (error) {
      toast({ title: "Could not save", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const poll = (startedAfter: number) => {
    pollTimer.current = window.setTimeout(async () => {
      const next = await load(false);
      const run = next?.lastSync;
      if (run && new Date(run.startedAt).getTime() >= startedAfter - 5000 && run.status !== "running") {
        setSyncing(false);
        toast({
          title: run.status === "success" ? "Sync finished" : run.status === "partial" ? "Sync finished with problems" : "Sync failed",
          description: run.message ?? `${run.weeksSaved} weeks saved${run.failures.length ? `; ${run.failures.length} failed` : ""}.`,
          variant: run.status === "error" ? "destructive" : undefined,
        });
        return;
      }
      poll(startedAfter);
    }, 5000);
  };

  const syncNow = async () => {
    setSyncing(true);
    const started = Date.now();
    try {
      await api("/api/engagement/sync-now", { method: "POST" });
      poll(started);
    } catch (error) {
      setSyncing(false);
      toast({ title: "Could not start the sync", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const response = await api("/api/engagement/send-test-email", { method: "POST" });
      const result = await response.json() as { to: string };
      toast({ title: "Test email sent", description: `Sent to ${result.to}.` });
    } catch (error) {
      toast({ title: "Could not send", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const savedKeys = new Set(data.settings.dashboard.items.map((item) => `${item.kind}:${item.id}`));
  const eventsKey = (items: TrackedItem[]) => JSON.stringify(items.map((item) => [item.kind, item.id, (item.extraEvents ?? []).map((event) => event.id)]));
  const unsavedItems = eventsKey(draft.dashboard.items) !== eventsKey(data.settings.dashboard.items);
  const lastSync = data.lastSync;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" /> Engagement score &amp; dashboard</CardTitle>
        <p className="text-sm text-muted-foreground">
          The score (points out of {data.maxPoints}) shows next to each group on the reports' Discipleship page and on the{" "}
          <Link href="/engagement" className="text-primary hover:underline">Engagement tool</Link>.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Points</h3>
            <p className="text-sm">Total: <span className="font-semibold tabular-nums">{draftTotal}</span> points</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {PARTS.map((part) => (
              <div key={part.key} className="space-y-1">
                <Label htmlFor={`points-${part.key}`}>{part.label}</Label>
                <Input id={`points-${part.key}`} type="number" min={0} max={20} step={0.5} value={draft.points[part.key]}
                  onChange={(event) => setPoints(part.key, event.target.value)} />
                <p className="text-xs text-muted-foreground">{part.help}</p>
                {draft.points[part.key] > 0 && notSetUp[part.key] && <p className="text-xs text-amber-700">Not set up: {notSetUp[part.key]}</p>}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A score is the points someone earns out of the total. Parts that aren't set up yet are left out and the score is scaled to the
            total. {pointsChanged ? "Saving new points restarts the People tab's week-to-week history." : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {FIELD_ROWS.map((row) => (
              <div key={row.key} className="space-y-1">
                <Label htmlFor={`field-${row.key}`}>{row.label} field</Label>
                <select
                  id={`field-${row.key}`}
                  className={selectClass}
                  value={draft.fields[row.key] ?? ""}
                  onChange={(event) => setDraft({ ...draft, fields: { ...draft.fields, [row.key]: event.target.value || null } })}
                >
                  <option value="">Automatic{data.resolvedFields[row.key] && !draft.fields[row.key] ? ` (${fieldLabel(data.resolvedFields[row.key])})` : ""}</option>
                  {data.syncedFields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
                </select>
                {!data.resolvedFields[row.key] && <p className="text-xs text-amber-700">Not in the people sync yet: add it under Tool Management → Database.</p>}
              </div>
            ))}
            {(["giving", "leadership"] as const).map((key) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`field-${key}`}>{key === "giving" ? "Giving" : "Leadership"} field</Label>
                <select
                  id={`field-${key}`}
                  className={selectClass}
                  value={draft.fields[key] ?? ""}
                  onChange={(event) => setDraft({ ...draft, fields: { ...draft.fields, [key]: event.target.value || null } })}
                >
                  <option value="">Not set (left out)</option>
                  {data.syncedFields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">Counts when the field has a value (yes or a date){key === "giving" ? ", never amounts" : ""}. Add it to the people sync (Database tab) first.</p>
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="serving-window">Serving window (days)</Label>
              <Input id="serving-window" type="number" min={7} max={365} value={draft.servingWindowDays}
                onChange={(event) => setDraft({ ...draft, servingWindowDays: Number(event.target.value) || 90 })} />
            </div>
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <span className="font-medium">Forms:</span> any Planning Center form submission earns Form / Thrive
                {draft.excludedFormIds.length ? `, except ${draft.excludedFormIds.length} excluded form${draft.excludedFormIds.length === 1 ? "" : "s"}` : ""}.
              </p>
              <Button size="sm" variant="outline" onClick={() => setShowForms(!showForms)} disabled={!data.forms.length}>
                {showForms ? "Hide forms" : "Choose forms to leave out"}
              </Button>
            </div>
            {!data.forms.length && <p className="text-xs text-muted-foreground">The form list appears after the first sync (Sync now below).</p>}
            {showForms && (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {data.forms.map((form) => (
                  <label key={form.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                    <span className="flex min-w-0 items-center gap-2">
                      <input type="checkbox" checked={!excluded.has(form.id)} onChange={() => toggleForm(form.id)} />
                      <span className={`truncate ${excluded.has(form.id) ? "text-muted-foreground line-through" : ""}`}>{form.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{form.submissionCount.toLocaleString()}{form.archived ? " · archived" : ""}</span>
                  </label>
                ))}
              </div>
            )}
            {data.formsSyncedAt && <p className="text-xs text-muted-foreground">Submissions last pulled {new Date(data.formsSyncedAt).toLocaleString()}. Only who submitted and when is saved, never answers.</p>}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">People: green / yellow / red (points out of {draftTotal})</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="tier-green">Green at or above</Label>
              <Input id="tier-green" type="number" min={0.5} max={draftTotal} step={0.5} value={draft.tiers.green}
                onChange={(event) => setDraft({ ...draft, tiers: { ...draft.tiers, green: Number(event.target.value) || 0 } })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tier-yellow">Yellow at or above</Label>
              <Input id="tier-yellow" type="number" min={0.5} max={draftTotal} step={0.5} value={draft.tiers.yellow}
                onChange={(event) => setDraft({ ...draft, tiers: { ...draft.tiers, yellow: Number(event.target.value) || 0 } })} />
            </div>
            <div className="space-y-1">
              <Label>Red</Label>
              <p className="flex h-9 items-center text-sm text-muted-foreground">below {draft.tiers.yellow}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="missed-giving" className={draft.fields.giving ? "" : "text-muted-foreground"}>Giving "missed" after (days)</Label>
              <Input id="missed-giving" type="number" min={7} max={365} value={draft.missedGivingDays} disabled={!draft.fields.giving}
                onChange={(event) => setDraft({ ...draft, missedGivingDays: Number(event.target.value) || 35 })} />
            </div>
          </div>
          {(draft.tiers.yellow >= draft.tiers.green || draft.tiers.green > draftTotal) && (
            <p className="text-xs text-destructive">Green has to be higher than yellow and no more than {draftTotal}.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Every Monday each person who attended a tracked group or event in the last 26 weeks gets a score over the default window below, and the
            Engagement tool's People tab flags anyone who dropped a level. With a Giving field that holds a date, "missed" means that date just got
            older than the days above; "canceled" means the field was emptied. Changing the cutoffs re-sorts the saved weeks too. Nothing here is emailed.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Tracked on the dashboard</h3>
          <p className="text-xs text-muted-foreground">Each one counts toward Transform, or toward TC College for the TC College event (anything with "College" in its name starts as TC College).</p>
          {!draft.dashboard.items.length && <p className="text-sm text-muted-foreground">Nothing yet. Add Check-Ins events, groups or group types below.</p>}
          <ul className="divide-y rounded-md border">
            {draft.dashboard.items.map((item) => {
              const key = `${item.kind}:${item.id}`;
              const state = data.syncState[key];
              return (
                <li key={key} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1 space-y-1">
                    {item.extraEvents?.length ? (
                      <Input aria-label="Card name" className="h-8 max-w-sm font-medium" value={item.name}
                        onChange={(event) => setDashboard({ items: draft.dashboard.items.map((entry) => itemKeyOf(entry) === key ? { ...entry, name: event.target.value } : entry) })} />
                    ) : <p className="font-medium">{item.name}</p>}
                    {item.kind === "checkins_event" && (
                      <div className="flex flex-wrap items-center gap-1">
                        {item.extraEvents?.length ? (
                          <>
                            <span className="rounded-full border px-2 py-0.5 text-xs" title="Main event">{sources ? eventName(item.id) : "Main event"}</span>
                            {item.extraEvents.map((event) => (
                              <span key={event.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                                {event.name}
                                <button type="button" aria-label={`Remove ${event.name}`} className="text-muted-foreground hover:text-foreground" onClick={() => removeEvent(key, event.id)}>
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </>
                        ) : null}
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => startAddingTo(key)}
                          disabled={(item.extraEvents?.length ?? 0) >= MAX_EVENTS_PER_ITEM - 1}>
                          <Plus className="mr-1 h-3 w-3" /> Add events
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {item.extraEvents?.length ? `${item.extraEvents.length + 1} Check-Ins events combined` : KIND_LABEL[item.kind]} · {state ? `history from ${state.pulledFrom}, last synced ${new Date(state.lastSyncedAt).toLocaleDateString()}` : savedKeys.has(key) ? "not synced yet" : "not saved yet"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                  <select
                    aria-label={`What ${item.name} counts toward`}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={item.role}
                    onChange={(event) => setDashboard({
                      items: draft.dashboard.items.map((entry) => `${entry.kind}:${entry.id}` === key ? { ...entry, role: event.target.value as Role } : entry),
                    })}
                  >
                    {(Object.keys(ROLE_LABEL) as Role[]).map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
                  </select>
                  <Button size="icon" variant="ghost" aria-label={`Stop tracking ${item.name}`}
                    onClick={() => setDashboard({ items: draft.dashboard.items.filter((entry) => `${entry.kind}:${entry.id}` !== key) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div ref={pickerRef} className={`space-y-2 rounded-md border p-3 ${targetItem ? "border-primary" : ""}`}>
            {targetItem && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted px-2 py-1.5 text-sm">
                <span>Adding events to <span className="font-medium">{targetItem.name}</span>. Their attendance is merged into that card.</span>
                <Button size="sm" variant="ghost" onClick={finishPicking}>Cancel</Button>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="pick-kind">Add</Label>
                <select id="pick-kind" className={selectClass} value={pickKind} disabled={!!targetItem} onFocus={loadSources} onChange={(event) => { setPickKind(event.target.value as Kind); setPicked([]); loadSources(); }}>
                  <option value="group_type">Group type (recommended for seasonal groups)</option>
                  <option value="group">One group</option>
                  <option value="checkins_event">Check-Ins event</option>
                  <option value="checkins_master">Check-In master (Tool Management › Database)</option>
                  <option value="group_master">Group master (Tool Management › Database)</option>
                </select>
              </div>
              <div className="min-w-[200px] flex-1 space-y-1">
                <Label htmlFor="pick-filter">Search</Label>
                <Input id="pick-filter" value={filter} placeholder="Type to filter…" onFocus={loadSources} onChange={(event) => setFilter(event.target.value)} />
              </div>
              {pickKind === "checkins_event" && (
                <label className="flex h-9 items-center gap-2 text-sm">
                  <Switch checked={showArchived} onCheckedChange={setShowArchived} /> Include archived events (last 26 weeks)
                </label>
              )}
            </div>
            {sourcesLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading from Planning Center…</p>}
            {sourcesError && <p className="text-sm text-destructive">{sourcesError}</p>}
            {!sources && !sourcesLoading && !sourcesError && (
              <Button size="sm" variant="outline" onClick={loadSources}>Load events and groups</Button>
            )}
            {sources && pickKind === "checkins_event" && (
              <>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {!options.length && <p className="text-sm text-muted-foreground">No matches.</p>}
                  {options.map((entry) => (
                    <label key={entry.id} className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                      <span className="flex min-w-0 items-center gap-2">
                        <input type="checkbox" checked={picked.includes(entry.id)} onChange={() => togglePicked(entry.id)} />
                        <span className="truncate">{entry.name}</span>
                      </span>
                      {(() => {
                        const event = entry as { archived?: boolean; archivedAt?: string | null };
                        return event.archived ? (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            archived{event.archivedAt ? ` ${new Date(event.archivedAt).toLocaleDateString()}` : ""}
                          </span>
                        ) : null;
                      })()}
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                  <span className="text-xs text-muted-foreground">{picked.length} selected</span>
                  {targetItem ? (
                    <Button size="sm" onClick={addToTarget} disabled={!picked.length}><Plus className="mr-1 h-4 w-4" /> Add to {targetItem.name}</Button>
                  ) : (
                    <>
                      <Button size="sm" onClick={addCombined} disabled={!picked.length}>
                        <Plus className="mr-1 h-4 w-4" /> {picked.length > 1 ? "Add as one combined card" : "Add"}
                      </Button>
                      {picked.length > 1 && <Button size="sm" variant="outline" onClick={addSeparately}>Add each as its own card</Button>}
                    </>
                  )}
                  {picked.length > 0 && <Button size="sm" variant="ghost" onClick={() => setPicked([])}>Clear</Button>}
                </div>
                <p className="text-xs text-muted-foreground">Combine an event's yearly or archived versions into one card so its history carries over. Up to {MAX_EVENTS_PER_ITEM} events per card.</p>
              </>
            )}
            {sources && pickKind !== "checkins_event" && (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {!options.length && <p className="text-sm text-muted-foreground">No matches.</p>}
                {options.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => setDashboard({ items: [...draft.dashboard.items, { kind: pickKind, id: entry.id, name: entry.name, role: roleFor(entry.name) }] })}
                  >
                    <span className="truncate">{entry.name}</span>
                    <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Monday email</h3>
          <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-start">
            <label className="flex items-center gap-2 pt-2 text-sm">
              <Switch checked={draft.dashboard.emailEnabled} onCheckedChange={(emailEnabled) => setDashboard({ emailEnabled })} />
              Email the summary Mondays at 6:00 AM Eastern
            </label>
            <div className="space-y-1">
              <Label htmlFor="engagement-recipients">Send to (up to 10)</Label>
              <Textarea id="engagement-recipients" rows={2} value={recipientsText} placeholder="name@transformchurch.com, …" onChange={(event) => setRecipientsText(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="default-weeks">Default window</Label>
              <select id="default-weeks" className={selectClass} value={draft.dashboard.defaultWeeks} onChange={(event) => setDashboard({ defaultWeeks: Number(event.target.value) })}>
                {data.weekOptions.map((weeks) => <option key={weeks} value={weeks}>Last {weeks} weeks</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">The email has group and event numbers only: no names and no people flags. The default window is also used for the dashboard and for each person's score.</p>
        </section>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save
          </Button>
          <Button variant="outline" onClick={syncNow} disabled={syncing || unsavedItems || !data.settings.dashboard.items.length}>
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Sync now
          </Button>
          <Button variant="outline" onClick={sendTest} disabled={testing || !data.settings.dashboard.items.length}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />} Email me a test
          </Button>
          {unsavedItems && <span className="text-xs text-amber-700">Save first, then sync. Cards with new events re-pull their last 26 weeks.</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          {syncing
            ? "Syncing… a newly added item pulls its last 26 weeks, which can take a few minutes."
            : lastSync
              ? `Last sync ${lastSync.finishedAt ? new Date(lastSync.finishedAt).toLocaleString() : "(running)"}: ${lastSync.message ?? `${lastSync.itemsChecked} tracked, ${lastSync.weeksSaved} weeks saved`}${lastSync.failures.length ? `; failed: ${lastSync.failures.map((failure) => `${failure.item} (${failure.error})`).join("; ")}` : ""}.`
              : "Not synced yet. After adding items, save and click Sync now; it then runs every Monday at 6:00 AM Eastern."}
          {data.settings.dashboard.ownerName ? ` The sync uses ${data.settings.dashboard.ownerName}'s Planning Center connection (whoever saved last).` : ""}
        </p>
      </CardContent>
    </Card>
  );
}
