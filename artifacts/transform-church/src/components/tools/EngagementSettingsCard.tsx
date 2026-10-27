import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Gauge, Loader2, Mail, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/toolApi";

// Tool Management > Reporting: the engagement score's weights (used by the
// reports' Discipleship page and the Engagement dashboard), which people-sync
// fields hold Thrive / Serve Class / Last Served, and the dashboard's tracked
// events, groups and group types plus its Monday email (routes/engagement.ts).

type Part = "attendance" | "thrive" | "serveClass" | "serving" | "giving";
type Kind = "checkins_event" | "group" | "group_type";
type TrackedItem = { kind: Kind; id: string; name: string };
type SyncRun = { status: string; startedAt: string; finishedAt: string | null; itemsChecked: number; weeksSaved: number; failures: { item: string; error: string }[]; message?: string };
type Settings = {
  weights: Record<Part, number>;
  fields: { thrive?: string | null; serveClass?: string | null; lastServed?: string | null };
  servingWindowDays: number;
  dashboard: { items: TrackedItem[]; recipients: string[]; emailEnabled: boolean; defaultWeeks: number; ownerName: string };
};
type SettingsResponse = {
  settings: Settings;
  resolvedFields: { thrive: string | null; serveClass: string | null; lastServed: string | null };
  syncedFields: { key: string; label: string }[];
  weekOptions: number[];
  syncState: Record<string, { pulledFrom: string; lastSyncedAt: string } | null>;
  lastSync: SyncRun | null;
};
type Sources = { checkinsEvents: { id: string; name: string }[]; groups: { id: string; name: string }[]; groupTypes: { id: string; name: string; description: string }[] };

const PARTS: { key: Part; label: string; help: string }[] = [
  { key: "attendance", label: "Attendance", help: "average attendance rate" },
  { key: "thrive", label: "Thrive", help: "completed Thrive" },
  { key: "serveClass", label: "Serve Class", help: "completed Serve Class" },
  { key: "serving", label: "Serving", help: "Last Served within the window" },
];
const FIELD_ROWS: { key: "thrive" | "serveClass" | "lastServed"; label: string }[] = [
  { key: "thrive", label: "Thrive" },
  { key: "serveClass", label: "Serve Class" },
  { key: "lastServed", label: "Last Served" },
];
const KIND_LABEL: Record<Kind, string> = { checkins_event: "Check-Ins event", group: "Group", group_type: "Group type (every group of this type)" };
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
    const list = pickKind === "checkins_event" ? sources.checkinsEvents : pickKind === "group" ? sources.groups : sources.groupTypes;
    const tracked = new Set(draft.dashboard.items.map((item) => `${item.kind}:${item.id}`));
    const needle = filter.trim().toLowerCase();
    return list.filter((entry) => !tracked.has(`${pickKind}:${entry.id}`) && (!needle || entry.name.toLowerCase().includes(needle))).slice(0, 60);
  }, [sources, draft, pickKind, filter]);

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

  const setWeight = (part: Part, value: string) => setDraft({ ...draft, weights: { ...draft.weights, [part]: Math.min(10, Math.max(0, Number(value) || 0)) } });
  const setDashboard = (patch: Partial<Settings["dashboard"]>) => setDraft({ ...draft, dashboard: { ...draft.dashboard, ...patch } });
  const fieldLabel = (key: string | null) => data.syncedFields.find((field) => field.key === key)?.label ?? null;

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/engagement/settings", {
        method: "PUT",
        body: JSON.stringify({
          weights: draft.weights,
          fields: draft.fields,
          servingWindowDays: draft.servingWindowDays,
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
  const unsavedItems = draft.dashboard.items.some((item) => !savedKeys.has(`${item.kind}:${item.id}`)) || draft.dashboard.items.length !== data.settings.dashboard.items.length;
  const lastSync = data.lastSync;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" /> Engagement score &amp; dashboard</CardTitle>
        <p className="text-sm text-muted-foreground">
          The score (0–100) shows next to each group on the reports' Discipleship page and on the{" "}
          <Link href="/reporting/engagement" className="text-primary hover:underline">Engagement dashboard</Link>.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">How the score is weighted</h3>
          <div className="grid gap-3 sm:grid-cols-5">
            {PARTS.map((part) => (
              <div key={part.key} className="space-y-1">
                <Label htmlFor={`weight-${part.key}`}>{part.label}</Label>
                <Input id={`weight-${part.key}`} type="number" min={0} max={10} step={0.5} value={draft.weights[part.key]} onChange={(event) => setWeight(part.key, event.target.value)} />
                <p className="text-xs text-muted-foreground">{part.help}</p>
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="weight-giving" className="text-muted-foreground">Giving</Label>
              <Input id="weight-giving" type="number" value={draft.weights.giving} disabled />
              <p className="text-xs text-muted-foreground">Not connected yet; doesn't count.</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Score = weighted average of the parts. Weight 2 counts twice as much as weight 1; 0 leaves a part out.
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
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
                {!data.resolvedFields[row.key] && <p className="text-xs text-amber-700">Not in the people sync yet: add it on the people sync card.</p>}
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="serving-window">Serving window (days)</Label>
              <Input id="serving-window" type="number" min={7} max={365} value={draft.servingWindowDays}
                onChange={(event) => setDraft({ ...draft, servingWindowDays: Number(event.target.value) || 90 })} />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Tracked on the dashboard</h3>
          {!draft.dashboard.items.length && <p className="text-sm text-muted-foreground">Nothing yet. Add Check-Ins events, groups or group types below.</p>}
          <ul className="divide-y rounded-md border">
            {draft.dashboard.items.map((item) => {
              const key = `${item.kind}:${item.id}`;
              const state = data.syncState[key];
              return (
                <li key={key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {KIND_LABEL[item.kind]} · {state ? `history from ${state.pulledFrom}, last synced ${new Date(state.lastSyncedAt).toLocaleDateString()}` : savedKeys.has(key) ? "not synced yet" : "not saved yet"}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" aria-label={`Stop tracking ${item.name}`}
                    onClick={() => setDashboard({ items: draft.dashboard.items.filter((entry) => `${entry.kind}:${entry.id}` !== key) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="pick-kind">Add</Label>
                <select id="pick-kind" className={selectClass} value={pickKind} onFocus={loadSources} onChange={(event) => { setPickKind(event.target.value as Kind); loadSources(); }}>
                  <option value="group_type">Group type (recommended for seasonal groups)</option>
                  <option value="group">One group</option>
                  <option value="checkins_event">Check-Ins event</option>
                </select>
              </div>
              <div className="min-w-[200px] flex-1 space-y-1">
                <Label htmlFor="pick-filter">Search</Label>
                <Input id="pick-filter" value={filter} placeholder="Type to filter…" onFocus={loadSources} onChange={(event) => setFilter(event.target.value)} />
              </div>
            </div>
            {sourcesLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading from Planning Center…</p>}
            {sourcesError && <p className="text-sm text-destructive">{sourcesError}</p>}
            {!sources && !sourcesLoading && !sourcesError && (
              <Button size="sm" variant="outline" onClick={loadSources}>Load events and groups</Button>
            )}
            {sources && (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {!options.length && <p className="text-sm text-muted-foreground">No matches.</p>}
                {options.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => setDashboard({ items: [...draft.dashboard.items, { kind: pickKind, id: entry.id, name: entry.name }] })}
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
              <Label htmlFor="default-weeks">Email window</Label>
              <select id="default-weeks" className={selectClass} value={draft.dashboard.defaultWeeks} onChange={(event) => setDashboard({ defaultWeeks: Number(event.target.value) })}>
                {data.weekOptions.map((weeks) => <option key={weeks} value={weeks}>Last {weeks} weeks</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">The email has numbers only (no names). It's also the dashboard's default window.</p>
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
          {unsavedItems && <span className="text-xs text-amber-700">Save first, then sync the new items.</span>}
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
