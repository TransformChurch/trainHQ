import { useAdminListUsers, useGetProgressMatrix, useUpdateUserRole, getAdminListUsersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, MinusCircle, Shield } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

export default function AdminUsers() {
  const { data: users, isLoading: usersLoading } = useAdminListUsers();
  const { data: matrix, isLoading: matrixLoading } = useGetProgressMatrix();
  const { mutate: updateRole } = useUpdateUserRole();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");

  if (usersLoading || matrixLoading) return <div className="p-8 text-center">Loading user data...</div>;

  const handleRoleChange = (userId: string, newRole: "student" | "admin") => {
    updateRole({
      userId,
      data: { role: newRole }
    }, {
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
        <p className="text-muted-foreground mt-2">Manage user roles and monitor training progress.</p>
      </div>

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
                  <TableHead key={mod.id} className="text-center min-w-[120px] max-w-[150px]">
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
                      onValueChange={(val) => handleRoleChange(row.user.id, val as any)}
                    >
                      <SelectTrigger className="h-7 text-xs w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="admin">
                          <div className="flex items-center"><Shield className="w-3 h-3 mr-1 text-primary"/> Admin</div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  {matrix?.modules.map(mod => {
                    const result = row.results.find(r => r.moduleId === mod.id);
                    return (
                      <TableCell key={mod.id} className="text-center">
                        {result?.passed === true ? (
                          <div className="flex flex-col items-center gap-1 text-green-600">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="text-[10px] font-medium">{result.score}%</span>
                          </div>
                        ) : result?.passed === false ? (
                          <div className="flex flex-col items-center gap-1 text-destructive">
                            <XCircle className="w-5 h-5" />
                            <span className="text-[10px] font-medium">{result.score}%</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-muted-foreground/30">
                            <MinusCircle className="w-5 h-5" />
                            <span className="text-[10px]">-</span>
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
    </div>
  );
}