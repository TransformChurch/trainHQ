import { useEffect, useState } from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
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
  const { toast } = useToast();
  const [data, setData] = useState<AccessData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/admin/tool-access")
      .then(async (response) => setData(await response.json() as AccessData))
      .catch((error) => toast({ title: "Could not load tool access", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

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
      <p className="text-sm text-destructive">Access settings could not be loaded. Refresh to try again.</p>
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
