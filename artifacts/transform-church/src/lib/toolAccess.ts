import { useQuery } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { api } from "@/lib/toolApi";

export type ToolKey = "reporting" | "messaging";
type ToolAccess = Record<ToolKey, boolean>;

// Which gated tools (Reporting, Messaging) the signed-in user may open, as
// set on the Tool Management page. Shared by the sidebar and route guards;
// the API enforces the same rule server-side (middlewares/requireToolAccess).
export function useToolAccess() {
  const { data: me } = useGetMe();
  // Admins always have access, so never make them wait on (or lose the tools
  // to a failure of) the access lookup.
  const isAdmin = me?.role === "admin";
  const query = useQuery({
    queryKey: ["tool-access", "me", me?.id],
    enabled: !!me && !isAdmin,
    staleTime: 60_000,
    queryFn: async () => (await api("/api/tool-access/me")).json() as Promise<ToolAccess>,
  });
  return {
    loading: !!me && !isAdmin && query.isLoading,
    can: (tool: ToolKey) => isAdmin || query.data?.[tool] === true,
  };
}
