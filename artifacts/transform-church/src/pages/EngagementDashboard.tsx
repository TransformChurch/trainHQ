import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Gauge, Loader2, Minus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/toolApi";

// Engagement dashboard (2026-10-27): a weekly "thermostat" for the Check-Ins
// events, groups and group types picked in Tool Management > Reporting >
// Engagement dashboard. Numbers come from GET /api/engagement/dashboard,
// refreshed every Monday at 6:00 AM Eastern.

type Part = "attendance" | "thrive" | "serveClass" | "serving" | "giving";
type Metrics = {
  from: string;
  to: string;
  heldWeeks: number;
  avgAttendance: number | null;
  avgNewGuests: number | null;
  uniqueAttendees: number;
  attendanceRate: number | null;
  engagement: { people: number; percentages: Record<Part, number | null>; score: number | null };
};
type TrendPoint = { weekStart: string; attendees: number | null; newGuests: number | null; rollingRate: number | null; rollingAvgAttendance: number | null };
type Item = {
  kind: "checkins_event" | "group" | "group_type";
  id: string;
  name: string;
  current: Metrics;
  previous: Metrics;
  trend: TrendPoint[];
  lastWeekWithData: string | null;
};
type SyncRun = { status: string; finishedAt: string | null; startedAt: string; message?: string; failures: { item: string; error: string }[] };
type Dashboard = {
  weeks: number;
  window: { from: string; to: string };
  previousWindow: { from: string; to: string };
  items: Item[];
  overall: { current: Metrics; previous: Metrics } | null;
  weights: Record<Part, number>;
  servingWindowDays: number;
  fieldsFound: { thrive: boolean; serveClass: boolean; lastServed: boolean };
  lastSync: SyncRun | null;
};

const WEEK_OPTIONS = [4, 8, 12, 26];
const WEEKS_KEY = "tc-engagement-weeks";
const KIND_LABEL: Record<Item["kind"], string> = { checkins_event: "Check-Ins event", group: "Group", group_type: "Group type" };
const PART_LABEL: Record<Part, string> = { attendance: "Attendance", thrive: "Thrive", serveClass: "Serve Class", serving: "Serving", giving: "Giving" };

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
const num = (value: number | null) => (value === null ? "—" : value >= 10 ? Math.round(value).toLocaleString() : value.toFixed(1));
const shortDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const weekEnd = (ymd: string) => {
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
};

function Change({ current, previous, kind }: { current: number | null; previous: number | null; kind: "pct" | "num" | "int" | "score" }) {
  if (current === null || previous === null) return <span className="text-xs text-muted-foreground">no earlier data</span>;
  const diff = current - previous;
  const points = Math.abs(Math.round(diff * 100));
  const shown = kind === "pct" ? `${points} ${points === 1 ? "pt" : "pts"}` : kind === "score" || kind === "int" ? `${Math.abs(Math.round(diff))}` : num(Math.abs(diff));
  if ((kind === "pct" && Math.round(diff * 100) === 0) || (kind !== "pct" && Math.abs(diff) < 0.05)) {
    return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Minus className="h-3 w-3" /> no change</span>;
  }
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" aria-hidden /> {diff > 0 ? "up" : "down"} {shown}
    </span>
  );
}

function Stat({ label, value, change }: { label: string; value: string; change: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <div className="mt-0.5">{change}</div>
    </div>
  );
}

// The "thermostat": a 0-100 track with the score filled in.
function ScoreMeter({ score, size = "md" }: { score: number | null; size?: "md" | "lg" }) {
  const value = score ?? 0;
  return (
    <div className="flex items-center gap-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score ?? undefined} aria-label="Engagement score">
      <span className={`${size === "lg" ? "text-4xl" : "text-3xl"} font-bold tabular-nums`}>{score ?? "—"}</span>
      <div className="flex-1">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-[hsl(var(--chart-1))]" style={{ width: `${score === null ? 0 : value}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>0</span><span>50</span><span>100</span></div>
      </div>
    </div>
  );
}

function PartBars({ metrics, weights }: { metrics: Metrics; weights: Record<Part, number> }) {
  const parts: Part[] = ["attendance", "thrive", "serveClass", "serving", "giving"];
  return (
    <div className="space-y-1.5">
      {parts.map((part) => {
        const value = metrics.engagement.percentages[part];
        const counted = part !== "giving" && weights[part] > 0;
        return (
          <div key={part} className="grid grid-cols-[88px_1fr_40px] items-center gap-2 text-xs">
            <span className={counted ? "text-foreground" : "text-muted-foreground"}>
              {PART_LABEL[part]}{part === "giving" ? " (soon)" : ""}
            </span>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              {value !== null && <div className="h-full rounded-full bg-[hsl(var(--chart-2))]" style={{ width: `${Math.round(value * 100)}%` }} />}
            </div>
            <span className="text-right tabular-nums text-muted-foreground">{pct(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function TrendCharts({ item }: { item: Item }) {
  const data = item.trend.map((point) => ({
    ...point,
    label: shortDate(point.weekStart),
    ratePct: point.rollingRate === null ? null : Math.round(point.rollingRate * 100),
  }));
  const tooltipStyle = { fontSize: 12, borderRadius: 8, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", color: "hsl(var(--popover-foreground))" };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Weekly attendance (26 weeks)</p>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={5} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }}
                formatter={(value) => [value ?? "no sessions", "Attended"]} />
              <Bar dataKey="attendees" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Rolling attendance rate</p>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={5} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} unit="%" />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value === null || value === undefined ? "—" : `${value}%`, "Rate"]} />
              <Line type="monotone" dataKey="ratePct" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function ItemCard({ item, weights }: { item: Item; weights: Record<Part, number> }) {
  const { current, previous } = item;
  const noData = current.heldWeeks === 0;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg">{item.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{KIND_LABEL[item.kind]}{item.lastWeekWithData ? ` · last attendance week of ${shortDate(item.lastWeekWithData)}` : " · no attendance synced yet"}</p>
          </div>
          <div className="w-48"><ScoreMeter score={current.engagement.score} /></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {noData ? (
          <p className="text-sm text-muted-foreground">Nobody attended in this window{item.lastWeekWithData ? "" : " — run a sync from Tool Management if this was just added"}.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Avg. attendance rate" value={pct(current.attendanceRate)} change={<Change current={current.attendanceRate} previous={previous.attendanceRate} kind="pct" />} />
            <Stat label="Avg. attendance" value={num(current.avgAttendance)} change={<Change current={current.avgAttendance} previous={previous.avgAttendance} kind="num" />} />
            <Stat label="Avg. new guests / week" value={num(current.avgNewGuests)} change={<Change current={current.avgNewGuests} previous={previous.avgNewGuests} kind="num" />} />
            <Stat label="Different people" value={current.uniqueAttendees.toLocaleString()} change={<Change current={current.uniqueAttendees} previous={previous.uniqueAttendees} kind="int" />} />
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Engagement score parts ({current.engagement.people} people)</p>
            <PartBars metrics={current} weights={weights} />
          </div>
          <TrendCharts item={item} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function EngagementDashboard() {
  const [weeks, setWeeks] = useState<number | null>(() => {
    try {
      const saved = Number(window.localStorage.getItem(WEEKS_KEY));
      return WEEK_OPTIONS.includes(saved) ? saved : null;
    } catch {
      return null;
    }
  });
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (chosen: number | null) => {
    setLoading(true);
    setError("");
    try {
      const response = await api(`/api/engagement/dashboard${chosen ? `?weeks=${chosen}` : ""}`);
      setDashboard(await response.json() as Dashboard);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(weeks); }, [weeks]);

  const chooseWeeks = (value: number) => {
    setWeeks(value);
    try {
      window.localStorage.setItem(WEEKS_KEY, String(value));
    } catch {
      // Not remembered in a private window; that's fine.
    }
  };

  const activeWeeks = dashboard?.weeks ?? weeks ?? 8;
  const overall = dashboard?.overall;
  const missingFields = dashboard
    ? (["thrive", "serveClass", "lastServed"] as const).filter((key) => !dashboard.fieldsFound[key])
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/reporting" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Reporting
          </Link>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            <Gauge className="h-8 w-8 text-primary" /> Engagement
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dashboard
              ? `Last ${activeWeeks} weeks: ${shortDate(dashboard.window.from)} – ${shortDate(weekEnd(dashboard.window.to))}, compared with the ${activeWeeks} weeks before. Updated Mondays.`
              : "How engaged each tracked group and event is, updated every Monday."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Rolling window">
            {WEEK_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => chooseWeeks(option)}
                aria-pressed={activeWeeks === option}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${activeWeeks === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {option} wk
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => load(activeWeeks)} disabled={loading} aria-label="Refresh">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && !dashboard && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}

      {dashboard && !dashboard.items.length && (
        <Card>
          <CardContent className="space-y-2 p-6 text-sm">
            <p className="font-medium">Nothing is tracked yet.</p>
            <p className="text-muted-foreground">
              An admin picks the Check-Ins events, groups and group types to track in Tool Management → Reporting → Engagement dashboard.
            </p>
            <Link href="/admin/tools" className="inline-flex items-center gap-1 text-primary hover:underline">Open Tool Management <ArrowRight className="h-4 w-4" /></Link>
          </CardContent>
        </Card>
      )}

      {dashboard && !!missingFields.length && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          The people sync doesn't include {missingFields.map((key) => ({ thrive: "Thrive", serveClass: "Serve Class", lastServed: "Last Served" })[key]).join(", ")},
          so {missingFields.length === 1 ? "that part reads" : "those parts read"} 0%. Pick the field in Tool Management → Engagement dashboard.
        </p>
      )}

      {overall && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Big picture: everything tracked</CardTitle>
            <p className="text-xs text-muted-foreground">People in more than one group or event count once; weekly averages add up across them.</p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-[1.2fr_repeat(4,1fr)]">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground">Engagement score</p>
                <ScoreMeter score={overall.current.engagement.score} size="lg" />
                <Change current={overall.current.engagement.score} previous={overall.previous.engagement.score} kind="score" />
              </div>
              <Stat label="Avg. attendance rate" value={pct(overall.current.attendanceRate)} change={<Change current={overall.current.attendanceRate} previous={overall.previous.attendanceRate} kind="pct" />} />
              <Stat label="Avg. attendance / week" value={num(overall.current.avgAttendance)} change={<Change current={overall.current.avgAttendance} previous={overall.previous.avgAttendance} kind="num" />} />
              <Stat label="Avg. new guests / week" value={num(overall.current.avgNewGuests)} change={<Change current={overall.current.avgNewGuests} previous={overall.previous.avgNewGuests} kind="num" />} />
              <Stat label={`Different people (${activeWeeks} wk)`} value={overall.current.uniqueAttendees.toLocaleString()} change={<Change current={overall.current.uniqueAttendees} previous={overall.previous.uniqueAttendees} kind="int" />} />
            </div>
          </CardContent>
        </Card>
      )}

      {dashboard?.items.map((item) => <ItemCard key={`${item.kind}:${item.id}`} item={item} weights={dashboard.weights} />)}

      {dashboard && dashboard.items.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Side by side</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Group / event</th>
                  <th className="py-2 pr-3 text-right font-medium">Score</th>
                  <th className="py-2 pr-3 text-right font-medium">Rate</th>
                  <th className="py-2 pr-3 text-right font-medium">Avg. attendance</th>
                  <th className="py-2 pr-3 text-right font-medium">New / wk</th>
                  <th className="py-2 pr-3 text-right font-medium">People</th>
                  <th className="py-2 pr-3 text-right font-medium">Thrive</th>
                  <th className="py-2 pr-3 text-right font-medium">Serve Class</th>
                  <th className="py-2 text-right font-medium">Serving</th>
                </tr>
              </thead>
              <tbody>
                {[...dashboard.items].sort((a, b) => (b.current.engagement.score ?? -1) - (a.current.engagement.score ?? -1)).map((item) => (
                  <tr key={`${item.kind}:${item.id}`} className="border-b last:border-0">
                    <td className="py-2 pr-3">{item.name}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{item.current.engagement.score ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{pct(item.current.attendanceRate)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{num(item.current.avgAttendance)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{num(item.current.avgNewGuests)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{item.current.uniqueAttendees.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{pct(item.current.engagement.percentages.thrive)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{pct(item.current.engagement.percentages.serveClass)}</td>
                    <td className="py-2 text-right tabular-nums">{pct(item.current.engagement.percentages.serving)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {dashboard && (
        <p className="text-xs text-muted-foreground">
          Engagement (0–100) is the weighted average of attendance rate, Thrive, Serve Class and serving
          (Last Served within {dashboard.servingWindowDays} days); giving will join once it's connected. Weights:{" "}
          {(["attendance", "thrive", "serveClass", "serving"] as Part[]).map((part) => `${PART_LABEL[part]} ×${dashboard.weights[part]}`).join(", ")}.
          Attendance rate = weeks each person came ÷ weeks that met, averaged over everyone who came. Weeks nobody attended don't count.
          {dashboard.lastSync?.finishedAt ? ` Last synced ${new Date(dashboard.lastSync.finishedAt).toLocaleString()}.` : ""}
        </p>
      )}
    </div>
  );
}
