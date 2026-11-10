import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDown, ArrowRight, Circle, ExternalLink, HandCoins, Loader2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/toolApi";

// Engagement page > People (2026-11-10): how many people are green / yellow /
// red on their personal engagement score, who dropped a tier since last
// Monday, and whose Giving field was cleared or went stale. Names stay on
// this page (Reporting access); nothing here is emailed.
// Data: GET /api/engagement/people (lib/engagementPeople.ts).

type Tier = "green" | "yellow" | "red";
type Drop = { personId: string; name: string; from: Tier; to: Tier; score: number | null; previousScore: number | null; items: string[] };
type GivingFlag = { personId: string; name: string; kind: "canceled" | "missed"; givingDate: string | null; previousGivingDate: string | null };
type People = {
  weekStart: string | null;
  previousWeekStart: string | null;
  tiers: { green: number; yellow: number };
  scoreWeeks: number;
  counts: Record<Tier, number>;
  previousCounts: Record<Tier, number> | null;
  history: { weekStart: string; green: number; yellow: number; red: number }[];
  drops: Drop[];
  giving: GivingFlag[];
  givingField: string | null;
  missedGivingDays: number;
  tierList?: { personId: string; name: string; score: number | null; items: string[] }[];
};

const TIERS: Tier[] = ["green", "yellow", "red"];
const TIER_LABEL: Record<Tier, string> = { green: "Green", yellow: "Yellow", red: "Red" };
// Status colors, always shown with the word, never color alone.
const TIER_DOT: Record<Tier, string> = { green: "text-emerald-600", yellow: "text-amber-500", red: "text-red-600" };
const TIER_FILL: Record<Tier, string> = { green: "#059669", yellow: "#f59e0b", red: "#dc2626" };
const TIER_BADGE: Record<Tier, string> = {
  green: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  yellow: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  red: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
};

const shortDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const pcoLink = (personId: string) => `https://people.planningcenteronline.com/people/AC${personId}`;

function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TIER_BADGE[tier]}`}>
      <Circle className={`h-2 w-2 fill-current ${TIER_DOT[tier]}`} aria-hidden /> {TIER_LABEL[tier]}
    </span>
  );
}

function PersonLink({ personId, name }: { personId: string; name: string }) {
  return (
    <a href={pcoLink(personId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
      {name} <ExternalLink className="h-3 w-3 text-muted-foreground" aria-label="Open in Planning Center" />
    </a>
  );
}

export function EngagementPeopleView() {
  const [data, setData] = useState<People | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [listTier, setListTier] = useState<Tier | null>(null);
  const [listing, setListing] = useState<People["tierList"] | null>(null);
  const [listLoading, setListLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api("/api/engagement/people");
      setData(await response.json() as People);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const showTier = async (tier: Tier) => {
    if (listTier === tier) {
      setListTier(null);
      setListing(null);
      return;
    }
    setListTier(tier);
    setListLoading(true);
    try {
      const response = await api(`/api/engagement/people?tier=${tier}`);
      setListing((await response.json() as People).tierList ?? []);
    } catch {
      setListing([]);
    } finally {
      setListLoading(false);
    }
  };

  if (loading && !data) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return null;
  if (!data.weekStart) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6 text-sm">
          <p className="font-medium">No people scores yet.</p>
          <p className="text-muted-foreground">They're saved after each Monday sync (or "Sync now" in Tool Management). Drops and giving flags start the week after the first one.</p>
        </CardContent>
      </Card>
    );
  }

  const total = TIERS.reduce((sum, tier) => sum + data.counts[tier], 0);
  const cutoffs: Record<Tier, string> = {
    green: `${data.tiers.green}+`,
    yellow: `${data.tiers.yellow}–${data.tiers.green - 1}`,
    red: `under ${data.tiers.yellow}`,
  };
  const history = data.history.map((point) => ({ ...point, label: shortDate(point.weekStart) }));
  const tooltipStyle = { fontSize: 12, borderRadius: 8, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", color: "hsl(var(--popover-foreground))" };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Week of {shortDate(data.weekStart)}{data.previousWeekStart ? `, compared with the week of ${shortDate(data.previousWeekStart)}` : " (first snapshot: changes start next week)"}.
          {" "}{total.toLocaleString()} people who attended a tracked group or event in the last 26 weeks.
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {TIERS.map((tier) => {
          const change = data.previousCounts ? data.counts[tier] - data.previousCounts[tier] : null;
          return (
            <button
              key={tier}
              type="button"
              onClick={() => showTier(tier)}
              aria-pressed={listTier === tier}
              className={`rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/50 ${listTier === tier ? "ring-2 ring-ring" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                  <Circle className={`h-3 w-3 fill-current ${TIER_DOT[tier]}`} aria-hidden /> {TIER_LABEL[tier]}
                </span>
                <span className="text-xs text-muted-foreground">score {cutoffs[tier]}</span>
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums">{data.counts[tier].toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">
                {total ? `${Math.round((data.counts[tier] / total) * 100)}% of people` : ""}
                {change !== null ? ` · ${change === 0 ? "no change" : `${change > 0 ? "+" : "−"}${Math.abs(change)} since last week`}` : ""}
              </p>
              <p className="mt-1 text-xs text-primary">{listTier === tier ? "Hide list" : "See who"}</p>
            </button>
          );
        })}
      </div>

      {listTier && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Everyone in {TIER_LABEL[listTier].toLowerCase()} ({data.counts[listTier]})</CardTitle></CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            {listLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-1.5 pr-3 font-medium">Name</th><th className="py-1.5 pr-3 text-right font-medium">Score</th><th className="py-1.5 font-medium">Attends</th></tr></thead>
                <tbody>
                  {(listing ?? []).map((person) => (
                    <tr key={person.personId} className="border-b last:border-0">
                      <td className="py-1.5 pr-3"><PersonLink personId={person.personId} name={person.name} /></td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{person.score ?? "—"}</td>
                      <td className="py-1.5 text-muted-foreground">{person.items.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4" /> Dropped a level this week ({data.drops.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {!data.previousWeekStart ? (
              <p className="text-sm text-muted-foreground">Starts after next Monday's snapshot.</p>
            ) : !data.drops.length ? (
              <p className="text-sm text-muted-foreground">Nobody dropped a level since last week.</p>
            ) : (
              <ul className="divide-y">
                {data.drops.map((drop) => (
                  <li key={drop.personId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <PersonLink personId={drop.personId} name={drop.name} />
                      {!!drop.items.length && <p className="truncate text-xs text-muted-foreground">{drop.items.join(", ")}</p>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TierBadge tier={drop.from} />
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-label="to" />
                      <TierBadge tier={drop.to} />
                      <span className="ml-1 text-xs tabular-nums text-muted-foreground">{drop.previousScore ?? "—"} → {drop.score ?? "—"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><HandCoins className="h-4 w-4" /> Giving changes this week ({data.giving.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {!data.givingField ? (
              <p className="text-sm text-muted-foreground">No Giving field is set. Pick one in Tool Management → Engagement score &amp; dashboard.</p>
            ) : !data.previousWeekStart ? (
              <p className="text-sm text-muted-foreground">Starts after next Monday's snapshot.</p>
            ) : !data.giving.length ? (
              <p className="text-sm text-muted-foreground">No canceled or missed giving since last week.</p>
            ) : (
              <ul className="divide-y">
                {data.giving.map((flag) => (
                  <li key={`${flag.personId}-${flag.kind}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <PersonLink personId={flag.personId} name={flag.name} />
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                      <ArrowDown className="h-3 w-3" aria-hidden />
                      {flag.kind === "canceled"
                        ? `Canceled (was ${flag.previousGivingDate ? shortDate(flag.previousGivingDate) : "set"})`
                        : `Missed: last ${flag.givingDate ? shortDate(flag.givingDate) : "—"}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data.givingField && (
              <p className="mt-3 text-xs text-muted-foreground">
                From the "{data.givingField}" field: canceled = it was filled in last week and is empty now; missed = its date just passed {data.missedGivingDays} days old.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {history.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Week by week</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {TIERS.map((tier) => (
                    <Bar key={tier} dataKey={tier} name={TIER_LABEL[tier]} stackId="tiers" fill={TIER_FILL[tier]} stroke="hsl(var(--background))" strokeWidth={1} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Each person's score (0–100) uses the same parts and weights as the group scores: their attendance in the tracked groups and events over the last {data.scoreWeeks} weeks,
        plus Thrive, Serve Class, serving{data.givingField ? " and giving" : ""} from their Planning Center profile. Green is {cutoffs.green}, yellow {cutoffs.yellow}, red {cutoffs.red};
        cutoffs are set in Tool Management. Saved every Monday after the sync.
      </p>
    </div>
  );
}
