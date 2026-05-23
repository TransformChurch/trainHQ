import { useGetDashboardSummary, useAdminListUsers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, Activity, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function AdminDashboard() {
  const { data: users, isLoading: usersLoading } = useAdminListUsers();
  
  if (usersLoading) return <div className="p-8 text-center">Loading admin data...</div>;

  const totalUsers = users?.length || 0;
  const students = users?.filter(u => u.role === "student").length || 0;
  const admins = users?.filter(u => u.role === "admin").length || 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold font-serif">Admin Overview</h1>
        <p className="text-muted-foreground mt-2">Manage users, track progress, and organize training content.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-t-4 border-t-primary shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-2">{students} students, {admins} admins</p>
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
            <Link href="/admin/content">
              <Button variant="outline" className="w-full mt-2">Manage Content</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {users?.slice(0, 5).map(user => (
              <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                    {user.firstName[0]}{user.lastName[0]}
                  </div>
                  <div>
                    <h4 className="font-semibold">{user.firstName} {user.lastName}</h4>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${user.role === 'admin' ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {user.role}
                  </span>
                  <span className="text-xs text-muted-foreground">Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <Link href="/admin/users">
              <Button variant="link">View All Users</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}