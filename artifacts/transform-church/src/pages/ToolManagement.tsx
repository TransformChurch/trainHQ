import { useCallback, useEffect, useState } from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/toolApi";
import { ReportingAdminCards } from "@/components/tools/ReportingAdminCards";
import { ToolAccessCard, type AccessUser, type ToolAccessConfig } from "@/components/tools/ToolAccessCard";
import { WikiDriveSyncCard } from "@/components/tools/WikiDriveSyncCard";
import type { ToolKey } from "@/lib/toolAccess";

type AccessData = { tools: Record<ToolKey, ToolAccessConfig>; users: AccessUser[] };

// One home for every tool's admin-only controls: who can use it (Reporting
// and Messaging) and its setup (report templates/scripts, Weekly Pulse,
// attendance history, Wiki Drive sync). The tools' own pages stay focused on
// day-to-day use.
export default function ToolManagement() {
  const [data, setData] = useState<AccessData | null>(null);
  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState("");

  const loadAccess = useCallback(() => {
    setLoading(true);
    setLoadError("");
    api("/api/admin/tool-access")
      .then(async (response) => setData(await response.json() as AccessData))
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Request failed."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadAccess(); }, [loadAccess]);

  const accessCard = (tool: ToolKey, toolLabel: string) =>
    data ? (
      <ToolAccessCard
        tool={tool}
        toolLabel={toolLabel}
        config={data.tools[tool]}
        users={data.users}
        onSaved={(saved) => setData((current) => current && { ...current, tools: { ...current.tools, [tool]: saved } })}
      />
    ) : loading ? (
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading access settings…</p>
    ) : (
      <div className="space-y-2 rounded-md border border-destructive/40 p-4 text-sm">
        <p className="font-medium text-destructive">Access settings could not be loaded.</p>
        <p className="text-muted-foreground">{loadError || "Unknown error."} If this just deployed, the API may still be rolling out — wait a minute and retry.</p>
        <Button size="sm" variant="outline" onClick={loadAccess}>Retry</Button>
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          <SlidersHorizontal className="h-8 w-8 text-primary" /> Tool Management
        </h1>
        <p className="mt-2 text-muted-foreground">
          Admin controls for each tool: who can use it, and how it is set up.
        </p>
      </div>

      <Tabs defaultValue="reporting">
        <TabsList>
          <TabsTrigger value="reporting">Reporting</TabsTrigger>
          <TabsTrigger value="messaging">Messaging</TabsTrigger>
          <TabsTrigger value="wiki">Wiki</TabsTrigger>
        </TabsList>

        <TabsContent value="reporting" className="mt-6 space-y-6">
          {accessCard("reporting", "Reporting")}
          <ReportingAdminCards />
        </TabsContent>

        <TabsContent value="messaging" className="mt-6 space-y-6">
          {accessCard("messaging", "Messaging")}
        </TabsContent>

        <TabsContent value="wiki" className="mt-6 space-y-6">
          <WikiDriveSyncCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
