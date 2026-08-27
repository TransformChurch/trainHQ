import { useState, useEffect } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Users, Clock, CheckCircle2, UserPlus } from "lucide-react";

const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const token = sessionStorage.getItem("auth_bearer_token");
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts?.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

type AvailableGroup = {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  memberCount: number;
  isMember: boolean;
  requestStatus: "pending" | "approved" | "denied" | null;
};

export default function Groups() {
  const { data: me } = useGetMe();
  const { toast } = useToast();
  const [groups, setGroups] = useState<AvailableGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestingIds, setRequestingIds] = useState<Set<number>>(new Set());

  const loadGroups = async () => {
    try {
      const data = await apiFetch("/api/groups/available");
      setGroups(data);
    } catch {
      toast({ title: "Failed to load groups", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGroups(); }, []);

  const handleJoinRequest = async (groupId: number) => {
    setRequestingIds(prev => new Set(prev).add(groupId));
    try {
      await apiFetch(`/api/groups/${groupId}/join-requests`, { method: "POST" });
      toast({ title: "Join request sent!" });
      setGroups(prev => prev.map(g =>
        g.id === groupId ? { ...g, requestStatus: "pending" } : g
      ));
    } catch (err: any) {
      const msg = err.message?.includes("pending") ? "Request already sent" : "Failed to send request";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setRequestingIds(prev => { const s = new Set(prev); s.delete(groupId); return s; });
    }
  };

  const myGroups = groups.filter(g => g.isMember);
  const availableGroups = groups.filter(g => !g.isMember);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold font-serif">Groups</h1>
        <p className="text-muted-foreground mt-2">Browse groups and request to join communities.</p>
      </div>

      {/* My Groups */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          My Groups
        </h2>
        {myGroups.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">You haven't joined any groups yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myGroups.map(group => (
              <Card key={group.id} className="border-green-200 bg-green-50/30">
                <CardContent className="p-5">
                  <div className="mb-3">
                    <h3 className="font-semibold">{group.name}</h3>
                    {group.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{group.description}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs">
                      <Users className="w-3 h-3 mr-1" />
                      {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                    </Badge>
                    <Badge className="text-xs bg-green-100 text-green-700 border-green-200">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Member
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Available Groups */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-muted-foreground" />
          Available Groups
        </h2>
        {availableGroups.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No other groups available to join.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableGroups.map(group => {
              const isPending = group.requestStatus === "pending";
              const isDenied = group.requestStatus === "denied";
              const isRequesting = requestingIds.has(group.id);
              return (
                <Card key={group.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="mb-3">
                      <h3 className="font-semibold">{group.name}</h3>
                      {group.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{group.description}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="secondary" className="text-xs">
                        <Users className="w-3 h-3 mr-1" />
                        {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                      </Badge>
                      {isPending ? (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                          <Clock className="w-3 h-3 mr-1" />
                          Pending
                        </Badge>
                      ) : isDenied ? (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Not approved
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleJoinRequest(group.id)}
                          disabled={isRequesting}
                        >
                          <UserPlus className="w-3 h-3 mr-1" />
                          {isRequesting ? "Sending..." : "Request to Join"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
