import { useAdminListUsers, useGetProgressMatrix, useUpdateUserRole, getAdminListUsersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, MinusCircle, Shield, Users, Plus, Trash2, UserPlus, UserMinus, UserCog } from "lucide-react";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

type Group = { id: number; name: string; description: string | null; createdAt: string; memberCount: number };
type GroupMember = { id: number; groupId: number; addedAt: string; user: { id: string; firstName: string; lastName: string; email: string; role: string } };

function GroupsTab() {
  const { data: users } = useAdminListUsers();
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [addMemberUserId, setAddMemberUserId] = useState("");
  const [manageMembersOpen, setManageMembersOpen] = useState(false);

  const loadGroups = async () => {
    try {
      const data = await apiFetch("/api/groups");
      setGroups(data);
    } catch {
      toast({ title: "Failed to load groups", variant: "destructive" });
    } finally {
      setLoadingGroups(false);
    }
  };

  const loadMembers = async (groupId: number) => {
    setLoadingMembers(true);
    try {
      const data = await apiFetch(`/api/groups/${groupId}/members`);
      setMembers(data);
    } catch {
      toast({ title: "Failed to load members", variant: "destructive" });
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => { loadGroups(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: newName, description: newDesc || null }),
      });
      toast({ title: "Group created" });
      setCreateOpen(false);
      setNewName(""); setNewDesc("");
      loadGroups();
    } catch {
      toast({ title: "Failed to create group", variant: "destructive" });
    }
  };

  const handleDelete = async (groupId: number) => {
    if (!confirm("Delete this group? Members will not be affected.")) return;
    try {
      await apiFetch(`/api/groups/${groupId}`, { method: "DELETE" });
      toast({ title: "Group deleted" });
      if (selectedGroup?.id === groupId) { setSelectedGroup(null); setMembers([]); }
      loadGroups();
    } catch {
      toast({ title: "Failed to delete group", variant: "destructive" });
    }
  };

  const openManageMembers = (group: Group) => {
    setSelectedGroup(group);
    setAddMemberUserId("");
    loadMembers(group.id);
    setManageMembersOpen(true);
  };

  const handleAddMember = async () => {
    if (!selectedGroup || !addMemberUserId) return;
    try {
      await apiFetch(`/api/groups/${selectedGroup.id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: addMemberUserId }),
      });
      toast({ title: "Member added" });
      setAddMemberUserId("");
      loadMembers(selectedGroup.id);
      loadGroups();
    } catch (err: any) {
      const msg = err.message?.includes("already") ? "User is already in this group" : "Failed to add member";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedGroup) return;
    try {
      await apiFetch(`/api/groups/${selectedGroup.id}/members/${userId}`, { method: "DELETE" });
      toast({ title: "Member removed" });
      loadMembers(selectedGroup.id);
      loadGroups();
    } catch {
      toast({ title: "Failed to remove member", variant: "destructive" });
    }
  };

  const memberUserIds = new Set(members.map(m => m.user.id));
  const eligibleUsers = users?.filter(u => !memberUserIds.has(u.id)) ?? [];

  if (loadingGroups) return <div className="p-8 text-center text-muted-foreground">Loading groups...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">Create groups to assign modules to multiple users at once.</p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" /> New Group</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Group</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Group Name</label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Youth Leaders" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description (optional)</label>
                <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional description" />
              </div>
              <Button type="submit" className="w-full">Create Group</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {groups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <Users className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
            <h3 className="font-medium mb-1">No groups yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create a group to assign modules to multiple users at once.</p>
            <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Group</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(group => (
            <Card key={group.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{group.name}</h3>
                    {group.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{group.description}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                    onClick={() => handleDelete(group.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs">
                    <Users className="w-3 h-3 mr-1" />
                    {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                  </Badge>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openManageMembers(group)}>
                    Manage Members
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Manage Members Dialog */}
      <Dialog open={manageMembersOpen} onOpenChange={setManageMembersOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Members — {selectedGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Add member */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Add Member</label>
              <div className="flex gap-2">
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={addMemberUserId}
                  onChange={e => setAddMemberUserId(e.target.value)}
                >
                  <option value="">Select a user...</option>
                  {eligibleUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} ({u.email})
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={handleAddMember} disabled={!addMemberUserId}>
                  <UserPlus className="w-4 h-4" />
                </Button>
              </div>
              {eligibleUsers.length === 0 && (
                <p className="text-xs text-muted-foreground">All users are already in this group.</p>
              )}
            </div>

            {/* Member list */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Members ({members.length})</label>
              {loadingMembers ? (
                <div className="text-center py-4 text-sm text-muted-foreground">Loading...</div>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No members yet.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center justify-between bg-muted/30 rounded px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{m.user.firstName} {m.user.lastName}</p>
                        <p className="text-xs text-muted-foreground">{m.user.email}</p>
                      </div>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveMember(m.user.id)}
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminUsers() {
  const { data: users, isLoading: usersLoading } = useAdminListUsers();
  const { data: matrix, isLoading: matrixLoading } = useGetProgressMatrix();
  const { mutate: updateRole } = useUpdateUserRole();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");

  const handleRoleChange = (userId: string, newRole: "student" | "manager" | "admin") => {
    updateRole({ userId, data: { role: newRole } }, {
      onSuccess: () => {
        toast({ title: "Role updated successfully" });
        queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
      }
    });
  };

  const filteredRows = matrix?.rows.filter(row =>
    `${row.user.firstName} ${row.user.lastName} ${row.user.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold font-serif">Users & Progress</h1>
        <p className="text-muted-foreground mt-2">Manage users, groups, and monitor training progress.</p>
      </div>

      <Tabs defaultValue="matrix">
        <TabsList className="mb-6">
          <TabsTrigger value="matrix">Progress Matrix</TabsTrigger>
          <TabsTrigger value="groups">
            <Users className="w-4 h-4 mr-2" /> Groups
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix">
          {(usersLoading || matrixLoading) ? (
            <div className="p-8 text-center">Loading user data...</div>
          ) : (
            <Card>
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
                <CardTitle>Progress Matrix</CardTitle>
                <div className="w-full sm:w-72">
                  <Input
                    placeholder="Search users..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[250px]">User / Role</TableHead>
                      {matrix?.modules.map(mod => (
                        <TableHead key={mod.id} className="text-center min-w-[130px] max-w-[160px]">
                          <div className="truncate text-xs" title={mod.title}>{mod.title}</div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows?.map(row => (
                      <TableRow key={row.user.id}>
                        <TableCell>
                          <div className="font-medium">{row.user.firstName} {row.user.lastName}</div>
                          <div className="text-xs text-muted-foreground mb-2">{row.user.email}</div>
                          <Select
                            defaultValue={row.user.role}
                            onValueChange={(val) => handleRoleChange(row.user.id, val as "student" | "manager" | "admin")}
                          >
                            <SelectTrigger className="h-7 text-xs w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="student">Student</SelectItem>
                              <SelectItem value="manager">
                                <div className="flex items-center"><UserCog className="w-3 h-3 mr-1 text-blue-600" /> Manager</div>
                              </SelectItem>
                              <SelectItem value="admin">
                                <div className="flex items-center"><Shield className="w-3 h-3 mr-1 text-primary" /> Admin</div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        {matrix?.modules.map(mod => {
                          const result = row.results.find(r => r.moduleId === mod.id);
                          const pct = result?.score != null && result?.totalQuestions
                            ? Math.round((result.score / result.totalQuestions) * 100)
                            : null;
                          const attempts = (result as any)?.attempts ?? null;
                          return (
                            <TableCell key={mod.id} className="text-center">
                              {result?.passed === true ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex flex-col items-center gap-0.5 text-green-600 cursor-default">
                                      <CheckCircle2 className="w-5 h-5" />
                                      <span className="text-[10px] font-medium">{pct ?? 0}%</span>
                                      {attempts != null && (
                                        <span className="text-[9px] text-muted-foreground">{attempts} attempt{attempts !== 1 ? "s" : ""}</span>
                                      )}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>Passed — {pct ?? 0}% in {attempts ?? 1} attempt{attempts !== 1 ? "s" : ""}</TooltipContent>
                                </Tooltip>
                              ) : result?.passed === false ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex flex-col items-center gap-0.5 text-destructive cursor-default">
                                      <XCircle className="w-5 h-5" />
                                      <span className="text-[10px] font-medium">{pct ?? 0}%</span>
                                      {attempts != null && (
                                        <span className="text-[9px] text-muted-foreground">{attempts} attempt{attempts !== 1 ? "s" : ""}</span>
                                      )}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>Failed — {pct ?? 0}% after {attempts ?? 1} attempt{attempts !== 1 ? "s" : ""}</TooltipContent>
                                </Tooltip>
                              ) : (
                                <div className="flex flex-col items-center gap-1 text-muted-foreground/30">
                                  <MinusCircle className="w-5 h-5" />
                                  <span className="text-[10px]">—</span>
                                </div>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                    {filteredRows?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={(matrix?.modules.length || 0) + 1} className="h-24 text-center">
                          No users found matching your search.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="groups">
          <GroupsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
