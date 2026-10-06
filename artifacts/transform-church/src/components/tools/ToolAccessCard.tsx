import { useMemo, useState } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/toolApi";
import type { ToolKey } from "@/lib/toolAccess";

export type ToolAccessConfig = { roles: ("manager" | "student")[]; userIds: string[] };
export type AccessUser = { id: string; firstName: string; lastName: string; email: string; role: "student" | "manager" | "admin" };

const ROLE_OPTIONS: { value: "manager" | "student"; label: string; hint: string }[] = [
  { value: "manager", label: "Managers", hint: "Everyone with the Manager role" },
  { value: "student", label: "Students", hint: "Everyone with the Student role" },
];

const displayName = (user: AccessUser) => `${user.firstName} ${user.lastName}`.trim() || user.email;

// Who can open one gated tool: admins always, plus the roles and individual
// people picked here. Saved immediately via PUT /api/admin/tool-access/:tool.
export function ToolAccessCard({
  tool,
  toolLabel,
  config,
  users,
  onSaved,
}: {
  tool: ToolKey;
  toolLabel: string;
  config: ToolAccessConfig;
  users: AccessUser[];
  onSaved: (config: ToolAccessConfig) => void;
}) {
  const { toast } = useToast();
  const [roles, setRoles] = useState<ToolAccessConfig["roles"]>(config.roles);
  const [userIds, setUserIds] = useState<string[]>(config.userIds);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const dirty =
    roles.slice().sort().join() !== config.roles.slice().sort().join() ||
    userIds.slice().sort().join() !== config.userIds.slice().sort().join();

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return users
      .filter((user) => user.role !== "admin" && !userIds.includes(user.id))
      .filter((user) => `${displayName(user)} ${user.email}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [search, users, userIds]);

  const toggleRole = (role: "manager" | "student", checked: boolean) =>
    setRoles((current) => (checked ? [...new Set([...current, role])] : current.filter((value) => value !== role)));

  const save = async () => {
    setSaving(true);
    try {
      const response = await api(`/api/admin/tool-access/${tool}`, {
        method: "PUT",
        body: JSON.stringify({ roles, userIds }),
      });
      const saved = await response.json() as ToolAccessConfig;
      setRoles(saved.roles);
      setUserIds(saved.userIds);
      onSaved(saved);
      toast({ title: `${toolLabel} access saved` });
    } catch (error) {
      toast({ title: "Could not save access", description: error instanceof Error ? error.message : "Request failed.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Who can use {toolLabel}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Admins always have access. Turn on a role to let everyone with it in, and/or add specific people.
          Changes apply the next time they load the site.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <Label>Roles</Label>
          {ROLE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={roles.includes(option.value)}
                onCheckedChange={(checked) => toggleRole(option.value, checked === true)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{option.label}</span>
                <span className="block text-muted-foreground">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="space-y-3">
          <Label htmlFor={`${tool}-person-search`}>Specific people</Label>
          <div className="relative">
            <Input
              id={`${tool}-person-search`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email…"
              autoComplete="off"
            />
            {matches.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover text-sm shadow-md">
                {matches.map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent"
                      onClick={() => { setUserIds((current) => [...current, user.id]); setSearch(""); }}
                    >
                      <span className="truncate">{displayName(user)} <span className="text-muted-foreground">· {user.email}</span></span>
                      <span className="shrink-0 text-xs capitalize text-muted-foreground">{user.role}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {search.trim() && matches.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">No matching people (admins and people already added are hidden).</p>
            )}
          </div>
          {userIds.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {userIds.map((id) => {
                const user = usersById.get(id);
                return (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm">
                    {user ? displayName(user) : "Unknown user"}
                    <button
                      type="button"
                      aria-label={`Remove ${user ? displayName(user) : "user"}`}
                      className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                      onClick={() => setUserIds((current) => current.filter((value) => value !== id))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No individual people added.</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={!dirty || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save access
          </Button>
          {dirty && !saving && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
        </div>
      </CardContent>
    </Card>
  );
}
