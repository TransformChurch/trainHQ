import { useAdminListUsers, useGetProgressMatrix, useUpdateUserRole, useListTracks, useGetMe, getAdminListUsersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, XCircle, MinusCircle, Shield, Users, Plus, Trash2,
  UserPlus, UserMinus, UserCog, Copy, Download, ClipboardCheck, Clock, UserCheck,
  FileText, FolderOpen,
} from "lucide-react";
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

type Group = {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  memberCount: number;
  pendingRequests: number;
};
type GroupMember = {
  id: number;
  groupId: number;
  addedAt: string;
  user: { id: string; firstName: string; lastName: string; email: string; role: string };
};
type GroupManagerRow = {
  id: number;
  groupId: number;
  addedAt: string;
  user: { id: string; firstName: string; lastName: string; email: string; role: string };
};
type JoinRequest = {
  id: number;
  groupId: number;
  status: string;
  requestedAt: string;
  user: { id: string; firstName: string; lastName: string; email: string };
};
type DriveResource = {
  id: number;
  groupId: number;
  label: string;
  driveUrl: string;
  resourceType: "file" | "folder";
  sortOrder: number;
};

function GroupsTab() {
  const { data: users } = useAdminListUsers();
  const { data: me } = useGetMe();
  const { toast } = useToast();
  const isAdmin = me?.role === "admin";

  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [groupManagers, setGroupManagers] = useState<GroupManagerRow[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [addMemberUserId, setAddMemberUserId] = useState("");
  const [addManagerUserId, setAddManagerUserId] = useState("");
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  const [manageDialogTab, setManageDialogTab] = useState<"members" | "managers" | "requests" | "documents">("members");
  const [driveResources, setDriveResources] = useState<DriveResource[]>([]);
  const [newResourceLabel, setNewResourceLabel] = useState("");
  const [newResourceUrl, setNewResourceUrl] = useState("");
  const [addingResource, setAddingResource] = useState(false);

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

  const loadGroupData = async (groupId: number) => {
    setLoadingMembers(true);
    try {
      const [memberData, reqData] = await Promise.all([
        apiFetch(`/api/groups/${groupId}/members`),
        apiFetch(`/api/groups/${groupId}/join-requests`),
      ]);
      setMembers(memberData);
      setJoinRequests(reqData);
    } catch {
      toast({ title: "Failed to load group data", variant: "destructive" });
    } finally {
      setLoadingMembers(false);
    }
  };

  const loadManagers = async (groupId: number) => {
    try {
      const data = await apiFetch(`/api/groups/${groupId}/managers`);
      setGroupManagers(data);
    } catch {
      toast({ title: "Failed to load managers", variant: "destructive" });
    }
  };

  const loadDriveResources = async (groupId: number) => {
    try {
      const data = await apiFetch(`/api/groups/${groupId}/drive-resources`);
      setDriveResources(data);
    } catch {
      toast({ title: "Failed to load documents", variant: "destructive" });
    }
  };

  const handleAddDriveResource = async () => {
    if (!selectedGroup || !newResourceLabel.trim() || !newResourceUrl.trim()) return;
    if (!newResourceUrl.includes("drive.google.com")) {
      toast({ title: "Please enter a valid Google Drive URL", variant: "destructive" });
      return;
    }
    setAddingResource(true);
    try {
      await apiFetch(`/api/groups/${selectedGroup.id}/drive-resources`, {
        method: "POST",
        body: JSON.stringify({ label: newResourceLabel, driveUrl: newResourceUrl }),
      });
      toast({ title: "Document added" });
      setNewResourceLabel("");
      setNewResourceUrl("");
      loadDriveResources(selectedGroup.id);
    } catch {
      toast({ title: "Failed to add document", variant: "destructive" });
    } finally {
      setAddingResource(false);
    }
  };

  const handleDeleteDriveResource = async (resourceId: number) => {
    if (!selectedGroup) return;
    try {
      await apiFetch(`/api/groups/${selectedGroup.id}/drive-resources/${resourceId}`, { method: "DELETE" });
      toast({ title: "Document removed" });
      loadDriveResources(selectedGroup.id);
    } catch {
      toast({ title: "Failed to remove document", variant: "destructive" });
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

  const openManageDialog = (group: Group, tab: "members" | "managers" | "requests" | "documents" = "members") => {
    setSelectedGroup(group);
    setAddMemberUserId("");
    setAddManagerUserId("");
    setNewResourceLabel("");
    setNewResourceUrl("");
    setManageDialogTab(tab);
    loadGroupData(group.id);
    if (isAdmin) loadManagers(group.id);
    loadDriveResources(group.id);
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
      loadGroupData(selectedGroup.id);
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
      loadGroupData(selectedGroup.id);
      loadGroups();
    } catch {
      toast({ title: "Failed to remove member", variant: "destructive" });
    }
  };

  const handleAddManager = async () => {
    if (!selectedGroup || !addManagerUserId) return;
    try {
      await apiFetch(`/api/groups/${selectedGroup.id}/managers`, {
        method: "POST",
        body: JSON.stringify({ userId: addManagerUserId }),
      });
      toast({ title: "Manager assigned" });
      setAddManagerUserId("");
      loadManagers(selectedGroup.id);
    } catch (err: any) {
      const msg = err.message?.includes("already") ? "User is already a manager of this group" : "Failed to assign manager";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const handleRemoveManager = async (userId: string) => {
    if (!selectedGroup) return;
    try {
      await apiFetch(`/api/groups/${selectedGroup.id}/managers/${userId}`, { method: "DELETE" });
      toast({ title: "Manager removed" });
      loadManagers(selectedGroup.id);
    } catch {
      toast({ title: "Failed to remove manager", variant: "destructive" });
    }
  };

  const handleJoinRequestAction = async (requestId: number, action: "approve" | "deny") => {
    if (!selectedGroup) return;
    try {
      await apiFetch(`/api/groups/${selectedGroup.id}/join-requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      toast({ title: action === "approve" ? "Request approved — user added to group" : "Request denied" });
      loadGroupData(selectedGroup.id);
      loadGroups();
    } catch {
      toast({ title: "Failed to process request", variant: "destructive" });
    }
  };

  const handleCopyEmails = async (group: Group) => {
    try {
      const data = await apiFetch(`/api/groups/${group.id}/emails`);
      const emails: string[] = data.emails;
      if (emails.length === 0) {
        toast({ title: "No members in this group" });
        return;
      }
      await navigator.clipboard.writeText(emails.join(", "));
      toast({ title: `Copied ${emails.length} email${emails.length !== 1 ? "s" : ""} to clipboard` });
    } catch {
      toast({ title: "Failed to copy emails", variant: "destructive" });
    }
  };

  const handleDownloadCsv = (group: Group) => {
    const a = document.createElement("a");
    a.href = `${BASE}/api/groups/${group.id}/export.csv`;
    a.download = `group-${group.name.replace(/[^a-z0-9]/gi, "_")}-export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const memberUserIds = new Set(members.map(m => m.user.id));
  const eligibleUsers = users?.filter(u => !memberUserIds.has(u.id)) ?? [];
  const managerUserIds = new Set(groupManagers.map(m => m.user.id));
  const eligibleManagers = users?.filter(u => (u.role === "manager" || u.role === "admin") && !managerUserIds.has(u.id)) ?? [];

  if (loadingGroups) return <div className="p-8 text-center text-muted-foreground">Loading groups...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">Manage groups, members, and join requests.</p>
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
                  {isAdmin && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                      onClick={() => handleDelete(group.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                  <Badge variant="secondary" className="text-xs">
                    <Users className="w-3 h-3 mr-1" />
                    {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                  </Badge>
                  {group.pendingRequests > 0 && (
                    <button
                      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                      onClick={() => openManageDialog(group, "requests")}
                    >
                      <Clock className="w-3 h-3" />
                      {group.pendingRequests} request{group.pendingRequests !== 1 ? "s" : ""}
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-1 min-w-0" onClick={() => openManageDialog(group)}>
                    <UserCog className="w-3 h-3 mr-1" /> Manage
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleCopyEmails(group)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy member emails</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleDownloadCsv(group)}>
                        <Download className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Download CSV with completion data</TooltipContent>
                  </Tooltip>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Manage Group Dialog */}
      <Dialog open={manageMembersOpen} onOpenChange={setManageMembersOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedGroup?.name}</DialogTitle>
          </DialogHeader>

          <Tabs value={manageDialogTab} onValueChange={v => setManageDialogTab(v as any)}>
            <TabsList className="w-full">
              <TabsTrigger value="members" className="flex-1">
                Members
                {members.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1">{members.length}</Badge>
                )}
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="managers" className="flex-1">
                  Managers
                  {groupManagers.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1">{groupManagers.length}</Badge>
                  )}
                </TabsTrigger>
              )}
              <TabsTrigger value="requests" className="flex-1">
                Requests
                {joinRequests.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-700 min-w-[1rem] h-4">
                    {joinRequests.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex-1">
                Docs
                {driveResources.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1">{driveResources.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Members Tab */}
            <TabsContent value="members" className="space-y-4 mt-4">
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

              <div className="space-y-2">
                <label className="text-sm font-medium">Current Members ({members.length})</label>
                {loadingMembers ? (
                  <div className="text-center py-4 text-sm text-muted-foreground">Loading...</div>
                ) : members.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No members yet.</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
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
            </TabsContent>

            {/* Managers Tab (admin-only) */}
            {isAdmin && (
              <TabsContent value="managers" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Assign Manager</label>
                  <p className="text-xs text-muted-foreground">Assigned managers can manage members and approve join requests for this group.</p>
                  <div className="flex gap-2">
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={addManagerUserId}
                      onChange={e => setAddManagerUserId(e.target.value)}
                    >
                      <option value="">Select a manager or admin...</option>
                      {eligibleManagers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName} ({u.role})
                        </option>
                      ))}
                    </select>
                    <Button size="sm" onClick={handleAddManager} disabled={!addManagerUserId}>
                      <UserPlus className="w-4 h-4" />
                    </Button>
                  </div>
                  {eligibleManagers.length === 0 && (
                    <p className="text-xs text-muted-foreground">No additional managers or admins to assign.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Current Managers ({groupManagers.length})</label>
                  {groupManagers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No managers assigned. Managers can manage this group's members and approve join requests.</p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {groupManagers.map(m => (
                        <div key={m.id} className="flex items-center justify-between bg-muted/30 rounded px-3 py-2">
                          <div>
                            <p className="text-sm font-medium">{m.user.firstName} {m.user.lastName}</p>
                            <p className="text-xs text-muted-foreground capitalize">{m.user.role}</p>
                          </div>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveManager(m.user.id)}
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            )}

            {/* Join Requests Tab */}
            <TabsContent value="requests" className="mt-4">
              {loadingMembers ? (
                <div className="text-center py-4 text-sm text-muted-foreground">Loading...</div>
              ) : joinRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No pending join requests.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {joinRequests.map(jr => (
                    <div key={jr.id} className="flex items-center justify-between bg-muted/30 rounded px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{jr.user.firstName} {jr.user.lastName}</p>
                        <p className="text-xs text-muted-foreground">{jr.user.email}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Requested {new Date(jr.requestedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon" className="h-7 w-7 bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => handleJoinRequestAction(jr.id, "approve")}
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Approve</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon" variant="outline" className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleJoinRequestAction(jr.id, "deny")}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Deny</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            {/* Documents Tab */}
            <TabsContent value="documents" className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Add Document or Folder</label>
                <p className="text-xs text-muted-foreground">
                  Paste a Google Drive share link. Files get an inline preview; folders open in a new tab.
                </p>
                <Input
                  placeholder="Label (e.g. Onboarding Guide)"
                  value={newResourceLabel}
                  onChange={e => setNewResourceLabel(e.target.value)}
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="https://drive.google.com/..."
                    value={newResourceUrl}
                    onChange={e => setNewResourceUrl(e.target.value)}
                  />
                  <Button
                    size="sm"
                    onClick={handleAddDriveResource}
                    disabled={addingResource || !newResourceLabel.trim() || !newResourceUrl.trim()}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {newResourceUrl.includes("drive.google.com") && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {newResourceUrl.includes("/file/d/")
                      ? <><FileText className="w-3 h-3 text-blue-500" /> Detected: File — will show inline preview</>
                      : <><FolderOpen className="w-3 h-3 text-amber-500" /> Detected: Folder — will open in new tab</>
                    }
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Current Documents ({driveResources.length})</label>
                {driveResources.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No documents yet.</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {driveResources.map(r => (
                      <div key={r.id} className="flex items-center justify-between bg-muted/30 rounded px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {r.resourceType === "file"
                            ? <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                            : <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
                          }
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{r.label}</p>
                            <Badge variant="outline" className="text-[10px] capitalize mt-0.5">{r.resourceType}</Badge>
                          </div>
                        </div>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                          onClick={() => handleDeleteDriveResource(r.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminUsers() {
  const { data: users, isLoading: usersLoading } = useAdminListUsers();
  const { data: matrix, isLoading: matrixLoading } = useGetProgressMatrix();
  const { data: tracks } = useListTracks();
  const { mutate: updateRole } = useUpdateUserRole();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [trackFilter, setTrackFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupMemberIds, setGroupMemberIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    apiFetch("/api/groups").then(setGroups).catch(() => {});
  }, []);

  useEffect(() => {
    if (groupFilter === "all") { setGroupMemberIds(null); return; }
    apiFetch(`/api/groups/${groupFilter}/members`)
      .then((members: GroupMember[]) => setGroupMemberIds(new Set(members.map(m => m.user.id))))
      .catch(() => {});
  }, [groupFilter]);

  const handleRoleChange = (userId: string, newRole: "student" | "manager" | "admin") => {
    updateRole({ userId, data: { role: newRole } }, {
      onSuccess: () => {
        toast({ title: "Role updated successfully" });
        queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
      }
    });
  };

  const visibleModules = (matrix?.modules ?? []).filter(mod => {
    if (moduleFilter !== "all") return mod.id === parseInt(moduleFilter);
    if (trackFilter !== "all") return mod.trackId === parseInt(trackFilter);
    return true;
  });

  const modulesForModuleDropdown = trackFilter === "all"
    ? (matrix?.modules ?? [])
    : (matrix?.modules ?? []).filter(m => m.trackId === parseInt(trackFilter));

  const filteredRows = (matrix?.rows ?? []).filter(row => {
    const matchesSearch = `${row.user.firstName} ${row.user.lastName} ${row.user.email}`.toLowerCase().includes(search.toLowerCase());
    const matchesGroup = groupMemberIds === null || groupMemberIds.has(row.user.id);
    return matchesSearch && matchesGroup;
  });

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
              <CardHeader className="border-b pb-4 space-y-3">
                <CardTitle>Progress Matrix</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="Search users..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-44"
                  />
                  <Select value={groupFilter} onValueChange={(v) => setGroupFilter(v)}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="All groups" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All groups</SelectItem>
                      {groups.map(g => (
                        <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={trackFilter} onValueChange={(v) => { setTrackFilter(v); setModuleFilter("all"); }}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="All tracks" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All tracks</SelectItem>
                      {tracks?.map(t => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={moduleFilter} onValueChange={(v) => setModuleFilter(v)}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="All modules" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All modules</SelectItem>
                      {modulesForModuleDropdown.map(m => (
                        <SelectItem key={m.id} value={String(m.id)}>{m.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(groupFilter !== "all" || trackFilter !== "all" || moduleFilter !== "all" || search) && (
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setSearch(""); setGroupFilter("all"); setTrackFilter("all"); setModuleFilter("all"); }}>
                      Clear filters
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[250px]">User / Role</TableHead>
                      {visibleModules.map(mod => (
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
                        {visibleModules.map(mod => {
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
                        <TableCell colSpan={visibleModules.length + 1} className="h-24 text-center">
                          No users found matching your filters.
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
