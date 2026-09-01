import { useState } from "react";
import { useAdminListUsers, useGetAuditLog, useListTracks } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, BookOpen, Activity, ShieldCheck, ClipboardList, UserCog } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function roleBadge(role: string) {
  if (role === "admin") return <Badge className="bg-primary/20 text-primary border-0">Admin</Badge>;
  if (role === "manager") return <Badge className="bg-blue-100 text-blue-700 border-0">Manager</Badge>;
  return <Badge variant="secondary">Student</Badge>;
}

function actionBadge(action: string) {
  if (action === "create") return <Badge className="bg-green-100 text-green-700 border-0 text-xs">Created</Badge>;
  if (action === "update") return <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">Updated</Badge>;
  if (action === "delete") return <Badge className="bg-red-100 text-red-700 border-0 text-xs">Deleted</Badge>;
  return <Badge variant="outline" className="text-xs">{action}</Badge>;
}

export default function AdminDashboard() {
  const { data: users, isLoading: usersLoading } = useAdminListUsers();
  const { data: tracks } = useListTracks();
  const [selectedTrackId, setSelectedTrackId] = useState<string>("all");

  const auditParams = selectedTrackId !== "all" ? { trackId: parseInt(selectedTrackId) } : undefined;
  const { data: auditLog, isLoading: auditLoading } = useGetAuditLog(auditParams);

  if (usersLoading) return <div className="p-8 text-center">Loading admin data...</div>;

  const totalUsers = users?.length || 0;
  const students = users?.filter(u => u.role === "student").length || 0;
  const admins = users?.filter(u => u.role === "admin").length || 0;
  const managers = users?.filter(u => u.role === "manager") || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold font-serif">Admin Overview</h1>
        <p className="text-muted-foreground mt-2">Manage users, track progress, and organize training content.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-t-4 border-t-primary shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-2">{students} students · {managers.length} managers · {admins} admins</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="w-4 h-4" /> Student Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/admin/users">
              <Button variant="outline" className="w-full mt-2">View Matrix</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Training Content
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/admin/modules">
              <Button variant="outline" className="w-full mt-2">Manage Content</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Two-column: Managers + Recent Users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Managers box */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5 text-blue-600" /> Managers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {managers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No managers assigned yet.</p>
            ) : (
              <div className="space-y-3">
                {managers.map(user => (
                  <div key={user.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30">
                    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                      {user.firstName[0]}{user.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{user.firstName} {user.lastName}</div>
                      <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                    </div>
                    {roleBadge(user.role)}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 text-center">
              <Link href="/admin/users">
                <Button variant="link" size="sm">Manage roles in Users page</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Recent Users */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {users?.slice(0, 5).map(user => (
                <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                      {user.firstName[0]}{user.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{user.firstName} {user.lastName}</div>
                      <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                    </div>
                  </div>
                  <div className="shrink-0 ml-2">
                    {roleBadge(user.role)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-center">
              <Link href="/admin/users">
                <Button variant="link" size="sm">View All Users</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content Change Log */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-muted-foreground" /> Content Change Log
            </CardTitle>
            <div className="w-full sm:w-64">
              <Select value={selectedTrackId} onValueChange={setSelectedTrackId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Filter by track" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tracks</SelectItem>
                  {tracks?.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading change log...</div>
          ) : !auditLog || auditLog.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No changes recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="text-left py-2 pr-4 font-medium">When</th>
                    <th className="text-left py-2 pr-4 font-medium">Who</th>
                    <th className="text-left py-2 pr-4 font-medium">Action</th>
                    <th className="text-left py-2 pr-4 font-medium">Type</th>
                    <th className="text-left py-2 pr-4 font-medium">Name</th>
                    <th className="text-left py-2 font-medium">Track</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {auditLog.map(entry => (
                    <tr key={entry.id} className="hover:bg-muted/30">
                      <td className="py-2 pr-4 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(entry.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        {" "}
                        {new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-2 pr-4 font-medium max-w-[140px] truncate">{entry.actorName}</td>
                      <td className="py-2 pr-4">{actionBadge(entry.action)}</td>
                      <td className="py-2 pr-4 capitalize text-muted-foreground">{entry.entityType}</td>
                      <td className="py-2 pr-4 max-w-[180px] truncate">{entry.entityName}</td>
                      <td className="py-2 text-muted-foreground text-xs max-w-[140px] truncate">
                        {entry.trackName ?? (entry.trackId ? `Track #${entry.trackId}` : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
