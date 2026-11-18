import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Layers, Loader2, Plus, Save, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/toolApi";

// Tool Management > Database: Check-In masters (routes/checkinMasters.ts).
// A master joins many Check-Ins events (e.g. every Thrive class) so the
// Engagement dashboard, Check-Ins reports and Attendance history can treat
// them as one. At the end of each month a search finds new events matching
// the master's terms; admins get an email and approve them here.

type MasterEvent = { id: string; name: string };
type PendingEvent = MasterEvent & { foundAt: string; archived: boolean };
type Master = {
  id: string;
  name: string;
  includeTerms: string[];
  excludeTerms: string[];
  events: MasterEvent[];
  pending: PendingEvent[];
  dismissedIds: string[];
  updatedAt: string;
};
type SearchRun = { startedAt: string; finishedAt: string | null; trigger: string; status: string; found: { masterName: string; events: MasterEvent[] }[]; emailedTo: string[]; message?: string };
type PreviewEvent = { id: string; name: string; archived: boolean; createdAt: string | null; archivedAt: string | null; inMaster: string | null };
type Draft = { id: string | null; name: string; include: string; exclude: string; events: MasterEvent[] };

const terms = (value: string) => value.split(",").map((term) => term.trim()).filter(Boolean);
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "");

export function CheckinMastersCard() {
  const { toast } = useToast();
  const [masters, setMasters] = useState<Master[] | null>(null);
  const [lastRun, setLastRun] = useState<SearchRun | null>(null);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<PreviewEvent[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [pendingPick, setPendingPick] = useState<Record<string, string[]>>({});
  const [eventFilter, setEventFilter] = useState("");

  const load = async () => {
    try {
      const response = await api("/api/checkin-masters");
      const data = await response.json() as { masters: Master[]; lastRun: SearchRun | null };
      setMasters(data.masters);
      setLastRun(data.lastRun);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Request failed.");
    }
  };
  useEffect(() => { load(); }, []);

  const startNew = () => {
    setOpen("new");
    setDraft({ id: null, name: "", include: "", exclude: "", events: [] });
    setPreview(null);
    setEventFilter("");
  };
  const startEdit = (master: Master) => {
    if (open === master.id) {
      setOpen(null);
      setDraft(null);
      return;
    }
    setOpen(master.id);
    setDraft({ id: master.id, name: master.name, include: master.includeTerms.join(", "), exclude: master.excludeTerms.join(", "), events: master.events });
    setPreview(null);
    setEventFilter("");
  };

  const runPreview = async () => {
    if (!draft) return;
    setPreviewing(true);
    try {
      const response = await api("/api/checkin-masters/preview", {
        method: "POST",
        body: JSON.stringify({ includeTerms: terms(draft.include), excludeTerms: terms(draft.exclude) }),
      });
      const data = await response.json() as { events: PreviewEvent[] };
      setPreview(data.events);
      // New master: start with every match that isn't in another master.
      if (!draft.id) {
        setDraft({ ...draft, events: data.events.filter((event) => !event.inMaster).map(({ id, name }) => ({ id, name })) });
      }
    } catch (error) {
      toast({ title: "Could not search events", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    if (!terms(draft.include).length) {
      toast({ title: "Add at least one search term", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({ name: draft.name, includeTerms: terms(draft.include), excludeTerms: terms(draft.exclude), events: draft.events });
      const response = draft.id
        ? await api(`/api/checkin-masters/${draft.id}`, { method: "PUT", body })
        : await api("/api/checkin-masters", { method: "POST", body });
      const data = await response.json() as { master: Master };
      toast({ title: "Master saved", description: `${data.master.name}: ${data.master.events.length} events.` });
      setOpen(data.master.id);
      setDraft({ id: data.master.id, name: data.master.name, include: data.master.includeTerms.join(", "), exclude: data.master.excludeTerms.join(", "), events: data.master.events });
      setPreview(null);
      await load();
    } catch (error) {
      toast({ title: "Could not save", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (master: Master) => {
    if (!window.confirm(`Delete "${master.name}"? Its events stay in Planning Center; dashboard cards and scheduled reports using it will stop working.`)) return;
    try {
      await api(`/api/checkin-masters/${master.id}`, { method: "DELETE" });
      setOpen(null);
      setDraft(null);
      await load();
    } catch (error) {
      toast({ title: "Could not delete", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    }
  };

  const resolve = async (master: Master, approve: boolean, all: boolean) => {
    const eventIds = pendingPick[master.id] ?? [];
    try {
      await api(`/api/checkin-masters/${master.id}/${approve ? "approve" : "dismiss"}`, {
        method: "POST",
        body: JSON.stringify(all ? { all: true } : { eventIds }),
      });
      const count = all ? master.pending.length : eventIds.length;
      toast({ title: approve ? `${count} event${count === 1 ? "" : "s"} added to ${master.name}` : `${count} event${count === 1 ? "" : "s"} dismissed` });
      setPendingPick({ ...pendingPick, [master.id]: [] });
      await load();
      if (draft?.id === master.id) setOpen(null);
    } catch (error) {
      toast({ title: "Could not update", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    }
  };

  const searchNow = async () => {
    setSearching(true);
    try {
      const response = await api("/api/checkin-masters/search-now", { method: "POST" });
      const data = await response.json() as { run: SearchRun };
      toast({ title: "Search finished", description: data.run.message ?? "Done." });
      await load();
    } catch (error) {
      toast({ title: "Search failed", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const draftIds = useMemo(() => new Set(draft?.events.map((event) => event.id) ?? []), [draft]);
  const toggleDraftEvent = (event: MasterEvent) => {
    if (!draft) return;
    setDraft({ ...draft, events: draftIds.has(event.id) ? draft.events.filter((entry) => entry.id !== event.id) : [...draft.events, { id: event.id, name: event.name }] });
  };

  const editor = draft && (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="master-name">Name</Label>
          <Input id="master-name" value={draft.name} placeholder="Thrive Master" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="master-include">Event name contains any of</Label>
          <Input id="master-include" value={draft.include} placeholder="Thrive" onChange={(event) => setDraft({ ...draft, include: event.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="master-exclude">But none of</Label>
          <Input id="master-exclude" value={draft.exclude} placeholder="Leader, Test" onChange={(event) => setDraft({ ...draft, exclude: event.target.value })} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Separate terms with commas. Not case-sensitive. The monthly search uses these terms to suggest new events.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={runPreview} disabled={previewing || !terms(draft.include).length}>
          {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} Find matching events
        </Button>
        <span className="self-center text-sm">{draft.events.length} event{draft.events.length === 1 ? "" : "s"} in this master</span>
      </div>
      {preview && (
        <div className="space-y-1">
          <p className="text-sm font-medium">{preview.length} matching event{preview.length === 1 ? "" : "s"} (current and archived). Checked ones are in the master.</p>
          <div className="max-h-72 space-y-0.5 overflow-y-auto rounded border bg-background p-1">
            {preview.map((event) => {
              const elsewhere = event.inMaster && event.inMaster !== draft.name && !draftIds.has(event.id);
              return (
                <label key={event.id} className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                  <span className="flex min-w-0 items-center gap-2">
                    <input type="checkbox" checked={draftIds.has(event.id)} onChange={() => toggleDraftEvent(event)} />
                    <span className="truncate">{event.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {elsewhere ? `in ${event.inMaster} · ` : ""}{event.archived ? `archived ${shortDate(event.archivedAt)}` : "active"}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
      {draft.id && draft.events.length > 0 && !preview && (
        <div className="space-y-1">
          <Input value={eventFilter} placeholder="Filter this master's events…" onChange={(event) => setEventFilter(event.target.value)} className="h-8" />
          <div className="max-h-56 space-y-0.5 overflow-y-auto rounded border bg-background p-1">
            {draft.events.filter((event) => !eventFilter || event.name.toLowerCase().includes(eventFilter.toLowerCase())).map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                <span className="truncate">{event.name}</span>
                <button type="button" aria-label={`Remove ${event.name}`} className="text-muted-foreground hover:text-foreground" onClick={() => toggleDraftEvent(event)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save master
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(null); setDraft(null); }}>Cancel</Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5" /> Check-In masters</CardTitle>
        <p className="text-sm text-muted-foreground">
          Join many Check-Ins events into one master, like every Thrive class into "Thrive Master". Masters can be picked on the Engagement
          dashboard and in Check-Ins reports, and appear as their own rows in the Attendance history CSV. On the last day of each month
          (9 PM) a search looks for new events matching each master's terms and emails admins to approve them.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}
        {!masters && !loadError && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
        {masters && !masters.length && open !== "new" && <p className="text-sm text-muted-foreground">No masters yet.</p>}
        {masters && masters.length > 0 && (
          <ul className="divide-y rounded-md border">
            {masters.map((master) => {
              const picked = pendingPick[master.id] ?? [];
              return (
                <li key={master.id} className="space-y-3 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" className="min-w-0 text-left" onClick={() => startEdit(master)}>
                      <p className="flex items-center gap-1 font-medium">
                        {master.name} {open === master.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {master.events.length} events · contains "{master.includeTerms.join('", "')}"{master.excludeTerms.length ? `, not "${master.excludeTerms.join('", "')}"` : ""}
                      </p>
                    </button>
                    <div className="flex items-center gap-2">
                      {master.pending.length > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{master.pending.length} waiting for approval</span>
                      )}
                      <Button size="icon" variant="ghost" aria-label={`Delete ${master.name}`} onClick={() => remove(master)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {master.pending.length > 0 && (
                    <div className="space-y-2 rounded-md border border-amber-300 p-2">
                      <p className="text-sm font-medium">New matching events</p>
                      <div className="max-h-48 space-y-0.5 overflow-y-auto">
                        {master.pending.map((event) => (
                          <label key={event.id} className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                            <span className="flex min-w-0 items-center gap-2">
                              <input type="checkbox" checked={picked.includes(event.id)}
                                onChange={() => setPendingPick({ ...pendingPick, [master.id]: picked.includes(event.id) ? picked.filter((id) => id !== event.id) : [...picked, event.id] })} />
                              <span className="truncate">{event.name}</span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">found {shortDate(event.foundAt)}{event.archived ? " · archived" : ""}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => resolve(master, true, true)}><Check className="mr-1 h-4 w-4" /> Approve all</Button>
                        <Button size="sm" variant="outline" onClick={() => resolve(master, true, false)} disabled={!picked.length}>Approve selected</Button>
                        <Button size="sm" variant="ghost" onClick={() => resolve(master, false, false)} disabled={!picked.length}>Dismiss selected</Button>
                      </div>
                    </div>
                  )}
                  {open === master.id && editor}
                </li>
              );
            })}
          </ul>
        )}
        {open === "new" && editor}
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button variant="outline" onClick={startNew} disabled={open === "new"}><Plus className="mr-2 h-4 w-4" /> New master</Button>
          <Button variant="outline" onClick={searchNow} disabled={searching || !masters?.length}>
            {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} Search for new events now
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {lastRun
            ? `Last search ${new Date(lastRun.startedAt).toLocaleString()} (${lastRun.trigger}): ${lastRun.message ?? lastRun.status}${lastRun.emailedTo.length ? ` Emailed ${lastRun.emailedTo.length} admin${lastRun.emailedTo.length === 1 ? "" : "s"}.` : ""}`
            : "No search has run yet."}
          {" "}New events are never counted until approved, and dismissed ones aren't suggested again.
        </p>
      </CardContent>
    </Card>
  );
}
