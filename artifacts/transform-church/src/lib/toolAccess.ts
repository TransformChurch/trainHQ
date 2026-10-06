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
  const query = useQuery({
    queryKey: ["tool-access", "me", me?.id],
    enabled: !!me,
    staleTime: 60_000,
    queryFn: async () => (await api("/api/tool-access/me")).json() as Promise<ToolAccess>,
  });
  return {
    loading: !!me && query.isLoading,
    can: (tool: ToolKey) => query.data?.[tool] === true,
  };
}
