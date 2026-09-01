import { useEffect, useMemo, useState } from "react";
import { useAdminListUsers } from "@workspace/api-client-react";
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  Coffee,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Headphones,
  Loader2,
  Megaphone,
  Monitor,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck,
  Users,
  UsersRound,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  facilitiesApi,
  facilitiesIconOptions,
  type FacilitiesAccessGrant,
  type FacilitiesCategory,
  type FacilitiesCategoryAccessResponse,
  type FacilitiesCategoryAccessGrant,
  type FacilitiesCategoryGroupAccessGrant,
  type FacilitiesGroup,
  type FacilitiesGroupAccessGrant,
  type FacilitiesRequest,
} from "@/lib/facilities";

const iconMap = {
  wrench: Wrench,
  "alert-triangle": AlertTriangle,
  building: Building2,
  truck: Truck,
  coffee: Coffee,
  megaphone: Megaphone,
  monitor: Monitor,
  headphones: Headphones,
  clipboard: ClipboardList,
};

type CategoryDraft = {
  id?: number;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
};

type RequestDraft = {
  id?: number;
  categoryId: number;
  eyebrow: string;
  title: string;
  description: string;
  useWhen: string;
  url: string;
  buttonLabel: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
};

const emptyCategory: CategoryDraft = {
  name: "",
  description: "",
  sortOrder: 0,
  isActive: true,
};

const emptyRequest = (categoryId = 0): RequestDraft => ({
  categoryId,
  eyebrow: "",
  title: "",
  description: "",
  useWhen: "",
  url: "",
  buttonLabel: "Open form →",
  icon: "clipboard",
  sortOrder: 0,
  isActive: true,
});

export default function AdminFacilities() {
  const { data: users } = useAdminListUsers();
  const { toast } = useToast();
  const [categories, setCategories] = useState<FacilitiesCategory[]>([]);
  const [grants, setGrants] = useState<FacilitiesAccessGrant[]>([]);
  const [groupGrants, setGroupGrants] = useState<FacilitiesGroupAccessGrant[]>([]);
  const [groups, setGroups] = useState<FacilitiesGroup[]>([]);
  const [categoryGrants, setCategoryGrants] = useState<FacilitiesCategoryAccessGrant[]>([]);
  const [categoryGroupGrants, setCategoryGroupGrants] = useState<FacilitiesCategoryGroupAccessGrant[]>([]);
  const [selectedAccessCategoryId, setSelectedAccessCategoryId] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategory);
  const [requestDraft, setRequestDraft] = useState<RequestDraft>(emptyRequest());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [savingAccess, setSavingAccess] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const [catalog, access, groupAccess, availableGroups, sectionAccess] = await Promise.all([
        facilitiesApi<FacilitiesCategory[]>("/api/admin/facilities"),
        facilitiesApi<FacilitiesAccessGrant[]>("/api/admin/facilities/access"),
        facilitiesApi<FacilitiesGroupAccessGrant[]>("/api/admin/facilities/access/groups"),
        facilitiesApi<FacilitiesGroup[]>("/api/groups"),
        facilitiesApi<FacilitiesCategoryAccessResponse>("/api/admin/facilities/category-access"),
      ]);
      setCategories(catalog);
      setGrants(access);
      setGroupGrants(groupAccess);
      setGroups(availableGroups);
      setCategoryGrants(sectionAccess.users);
      setCategoryGroupGrants(sectionAccess.groups);
      setSelectedAccessCategoryId((current) => current || catalog[0]?.id || 0);
    } catch (err) {
      toast({ title: "Request Hub settings could not be loaded", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openNewCategory = () => {
    setCategoryDraft({ ...emptyCategory, sortOrder: categories.length });
    setCategoryDialogOpen(true);
  };

  const openEditCategory = (category: FacilitiesCategory) => {
    setCategoryDraft({
      id: category.id,
      name: category.name,
      description: category.description ?? "",
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    });
    setCategoryDialogOpen(true);
  };

  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await facilitiesApi(
        categoryDraft.id
          ? `/api/admin/facilities/categories/${categoryDraft.id}`
          : "/api/admin/facilities/categories",
        {
          method: categoryDraft.id ? "PATCH" : "POST",
          body: JSON.stringify(categoryDraft),
        },
      );
      toast({ title: categoryDraft.id ? "Category updated" : "Category added" });
      setCategoryDialogOpen(false);
      await load();
    } catch (err) {
      toast({ title: "Category could not be saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (category: FacilitiesCategory) => {
    const warning = category.requests.length
      ? `Delete “${category.name}” and its ${category.requests.length} request card${category.requests.length === 1 ? "" : "s"}?`
      : `Delete “${category.name}”?`;
    if (!window.confirm(warning)) return;
    try {
      await facilitiesApi(`/api/admin/facilities/categories/${category.id}`, { method: "DELETE" });
      toast({ title: "Category deleted" });
      await load();
    } catch (err) {
      toast({ title: "Category could not be deleted", description: (err as Error).message, variant: "destructive" });
    }
  };

  const openNewRequest = (categoryId?: number) => {
    const selectedCategory = categoryId ?? categories[0]?.id ?? 0;
    setRequestDraft(emptyRequest(selectedCategory));
    setRequestDialogOpen(true);
  };

  const openEditRequest = (request: FacilitiesRequest) => {
    setRequestDraft({
      id: request.id,
      categoryId: request.categoryId,
      eyebrow: request.eyebrow ?? "",
      title: request.title,
      description: request.description,
      useWhen: request.useWhen ?? "",
      url: request.url,
      buttonLabel: request.buttonLabel,
      icon: request.icon,
      sortOrder: request.sortOrder,
      isActive: request.isActive,
    });
    setRequestDialogOpen(true);
  };

  const saveRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await facilitiesApi(
        requestDraft.id
          ? `/api/admin/facilities/requests/${requestDraft.id}`
          : "/api/admin/facilities/requests",
        {
          method: requestDraft.id ? "PATCH" : "POST",
          body: JSON.stringify(requestDraft),
        },
      );
      toast({ title: requestDraft.id ? "Request card updated" : "Request card added" });
      setRequestDialogOpen(false);
      await load();
    } catch (err) {
      toast({ title: "Request card could not be saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteRequest = async (request: FacilitiesRequest) => {
    if (!window.confirm(`Delete “${request.title}”?`)) return;
    try {
      await facilitiesApi(`/api/admin/facilities/requests/${request.id}`, { method: "DELETE" });
      toast({ title: "Request card deleted" });
      await load();
    } catch (err) {
      toast({ title: "Request card could not be deleted", description: (err as Error).message, variant: "destructive" });
    }
  };

  const moveCategory = async (categoryIndex: number, direction: -1 | 1) => {
    const targetIndex = categoryIndex + direction;
    if (targetIndex < 0 || targetIndex >= categories.length) return;
    const reordered = [...categories];
    [reordered[categoryIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[categoryIndex]];
    setCategories(reordered.map((category, sortOrder) => ({ ...category, sortOrder })));
    try {
      const next = await facilitiesApi<FacilitiesCategory[]>("/api/admin/facilities/categories/reorder", {
        method: "PUT",
        body: JSON.stringify({ categoryIds: reordered.map((category) => category.id) }),
      });
      setCategories(next);
      toast({ title: "Category order updated" });
    } catch (err) {
      toast({ title: "Category order could not be updated", description: (err as Error).message, variant: "destructive" });
      await load();
    }
  };

  const grantedUserIds = useMemo(() => new Set(grants.map((grant) => grant.userId)), [grants]);
  const grantedGroupIds = useMemo(() => new Set(groupGrants.map((grant) => grant.groupId)), [groupGrants]);
  const selectedCategoryUserIds = useMemo(
    () => new Set(categoryGrants.filter((grant) => grant.categoryId === selectedAccessCategoryId).map((grant) => grant.userId)),
    [categoryGrants, selectedAccessCategoryId],
  );
  const selectedCategoryGroupIds = useMemo(
    () => new Set(categoryGroupGrants.filter((grant) => grant.categoryId === selectedAccessCategoryId).map((grant) => grant.groupId)),
    [categoryGroupGrants, selectedAccessCategoryId],
  );
  const filteredUsers = (users ?? []).filter((user) => {
    const haystack = `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });
  const filteredGroups = groups.filter((group) => {
    const haystack = `${group.name} ${group.description ?? ""}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  const setAccess = async (userId: string, enabled: boolean) => {
    const savingKey = `user:${userId}`;
    setSavingAccess((current) => new Set(current).add(savingKey));
    try {
      await facilitiesApi(`/api/admin/facilities/access/${encodeURIComponent(userId)}`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      const next = await facilitiesApi<FacilitiesAccessGrant[]>("/api/admin/facilities/access");
      setGrants(next);
      toast({ title: enabled ? "Request Hub access granted" : "Request Hub access removed" });
    } catch (err) {
      toast({ title: "Access could not be updated", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingAccess((current) => {
        const next = new Set(current);
        next.delete(savingKey);
        return next;
      });
    }
  };

  const setGroupAccess = async (groupId: number, enabled: boolean) => {
    const savingKey = `group:${groupId}`;
    setSavingAccess((current) => new Set(current).add(savingKey));
    try {
      await facilitiesApi(`/api/admin/facilities/access/groups/${groupId}`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      const next = await facilitiesApi<FacilitiesGroupAccessGrant[]>("/api/admin/facilities/access/groups");
      setGroupGrants(next);
      toast({ title: enabled ? "Request Hub access granted to group" : "Request Hub group access removed" });
    } catch (err) {
      toast({ title: "Group access could not be updated", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingAccess((current) => {
        const next = new Set(current);
        next.delete(savingKey);
        return next;
      });
    }
  };

  const setCategoryUserAccess = async (userId: string, enabled: boolean) => {
    if (!selectedAccessCategoryId) return;
    const savingKey = `category:${selectedAccessCategoryId}:user:${userId}`;
    setSavingAccess((current) => new Set(current).add(savingKey));
    try {
      await facilitiesApi(`/api/admin/facilities/categories/${selectedAccessCategoryId}/access/users/${encodeURIComponent(userId)}`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      const next = await facilitiesApi<FacilitiesCategoryAccessResponse>("/api/admin/facilities/category-access");
      setCategoryGrants(next.users);
      setCategoryGroupGrants(next.groups);
      toast({ title: enabled ? "Section access granted" : "Section access removed" });
    } catch (err) {
      toast({ title: "Section access could not be updated", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingAccess((current) => {
        const next = new Set(current);
        next.delete(savingKey);
        return next;
      });
    }
  };

  const setCategoryGroupAccess = async (groupId: number, enabled: boolean) => {
    if (!selectedAccessCategoryId) return;
    const savingKey = `category:${selectedAccessCategoryId}:group:${groupId}`;
    setSavingAccess((current) => new Set(current).add(savingKey));
    try {
      await facilitiesApi(`/api/admin/facilities/categories/${selectedAccessCategoryId}/access/groups/${groupId}`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      const next = await facilitiesApi<FacilitiesCategoryAccessResponse>("/api/admin/facilities/category-access");
      setCategoryGrants(next.users);
      setCategoryGroupGrants(next.groups);
      toast({ title: enabled ? "Section access granted to group" : "Section group access removed" });
    } catch (err) {
      toast({ title: "Section group access could not be updated", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingAccess((current) => {
        const next = new Set(current);
        next.delete(savingKey);
        return next;
      });
    }
  };

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold font-serif">Request Hub</h1>
        <p className="mt-2 text-muted-foreground">
          Manage request categories, links, button text, and who can access the Request Hub.
        </p>
      </div>

      <Tabs defaultValue="directory">
        <TabsList>
          <TabsTrigger value="directory"><ClipboardList className="mr-2 h-4 w-4" />Request Directory</TabsTrigger>
          <TabsTrigger value="section-access"><UsersRound className="mr-2 h-4 w-4" />Section Access</TabsTrigger>
          <TabsTrigger value="access"><Users className="mr-2 h-4 w-4" />Whole Hub Access</TabsTrigger>
        </TabsList>

        <TabsContent value="directory" className="mt-6 space-y-6">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={openNewCategory}>
              <Plus className="mr-2 h-4 w-4" />Add Category
            </Button>
            <Button onClick={() => openNewRequest()} disabled={categories.length === 0}>
              <Plus className="mr-2 h-4 w-4" />Add Request
            </Button>
          </div>

          {categories.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Add a category to begin building the directory.</CardContent></Card>
          ) : categories.map((category, categoryIndex) => (
            <Card key={category.id} className={!category.isActive ? "opacity-70" : ""}>
              <CardHeader className="gap-4 border-b sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{category.name}</CardTitle>
                    <Badge variant={category.isActive ? "default" : "secondary"}>{category.isActive ? "Visible" : "Hidden"}</Badge>
                    <span className="text-xs text-muted-foreground">Order {category.sortOrder}</span>
                  </div>
                  {category.description && <p className="mt-2 text-sm text-muted-foreground">{category.description}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={`Move ${category.name} up`}
                    disabled={categoryIndex === 0}
                    onClick={() => void moveCategory(categoryIndex, -1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={`Move ${category.name} down`}
                    disabled={categoryIndex === categories.length - 1}
                    onClick={() => void moveCategory(categoryIndex, 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openNewRequest(category.id)}>
                    <Plus className="mr-1 h-4 w-4" />Request
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Edit ${category.name}`} onClick={() => openEditCategory(category)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${category.name}`} onClick={() => deleteCategory(category)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {category.requests.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No request cards in this category yet.</p>
                ) : (
                  <div className="divide-y">
                    {category.requests.map((request) => {
                      const Icon = iconMap[request.icon as keyof typeof iconMap] ?? ClipboardList;
                      return (
                        <div key={request.id} className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-start ${!request.isActive ? "bg-muted/40 opacity-70" : ""}`}>
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{request.title}</p>
                              <Badge variant={request.isActive ? "outline" : "secondary"}>{request.isActive ? "Visible" : "Hidden"}</Badge>
                              <span className="text-xs text-muted-foreground">Order {request.sortOrder}</span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{request.description}</p>
                            <a href={request.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center text-xs text-primary underline-offset-4 hover:underline">
                              <span className="truncate">{request.buttonLabel} — {request.url}</span>
                              <ExternalLink className="ml-1 h-3 w-3 shrink-0" />
                            </a>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button size="icon" variant="ghost" aria-label={`Edit ${request.title}`} onClick={() => openEditRequest(request)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${request.title}`} onClick={() => deleteRequest(request)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="section-access" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Section Access</CardTitle>
              <p className="text-sm text-muted-foreground">
                Choose a Request Hub section, then grant access to specific people or groups. Whole Hub access still includes every section.
              </p>
              <div className="max-w-md pt-2">
                <Label htmlFor="section-access-category">Request section</Label>
                <Select value={String(selectedAccessCategoryId || "")} onValueChange={(value) => setSelectedAccessCategoryId(Number(value))}>
                  <SelectTrigger id="section-access-category" className="mt-2">
                    <SelectValue placeholder="Choose a section" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative max-w-md pt-2">
                <Search className="absolute left-3 top-5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users or groups" className="pl-9" />
              </div>
            </CardHeader>
          </Card>

          {selectedAccessCategoryId ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>User Access</CardTitle>
                  <p className="text-sm text-muted-foreground">Admins and people with Whole Hub access already see this section.</p>
                </CardHeader>
                <CardContent className="divide-y p-0">
                  {filteredUsers.map((user) => {
                    const inherited = user.role === "admin" || grantedUserIds.has(user.id);
                    const checked = inherited || selectedCategoryUserIds.has(user.id);
                    const savingKey = `category:${selectedAccessCategoryId}:user:${user.id}`;
                    return (
                      <div key={user.id} className="flex items-center justify-between gap-4 px-6 py-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium">{user.firstName} {user.lastName}</p>
                            <Badge variant="outline" className="capitalize">{user.role}</Badge>
                          </div>
                          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="hidden text-xs text-muted-foreground sm:inline">{inherited ? "Whole Hub access" : checked ? "Allowed" : "No access"}</span>
                          {savingAccess.has(savingKey) && <Loader2 className="h-4 w-4 animate-spin" />}
                          <Switch
                            checked={checked}
                            disabled={inherited || savingAccess.has(savingKey)}
                            onCheckedChange={(enabled) => void setCategoryUserAccess(user.id, enabled)}
                            aria-label={`Section access for ${user.firstName} ${user.lastName}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {filteredUsers.length === 0 && <p className="px-6 py-10 text-center text-sm text-muted-foreground">No users match your search.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5" />Group Access</CardTitle>
                  <p className="text-sm text-muted-foreground">Every member of an enabled group can see this section.</p>
                </CardHeader>
                <CardContent className="divide-y p-0">
                  {filteredGroups.map((group) => {
                    const inherited = grantedGroupIds.has(group.id);
                    const checked = inherited || selectedCategoryGroupIds.has(group.id);
                    const savingKey = `category:${selectedAccessCategoryId}:group:${group.id}`;
                    return (
                      <div key={group.id} className="flex items-center justify-between gap-4 px-6 py-4">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{group.name}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                            {group.description ? ` · ${group.description}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="hidden text-xs text-muted-foreground sm:inline">{inherited ? "Whole Hub access" : checked ? "Allowed" : "No access"}</span>
                          {savingAccess.has(savingKey) && <Loader2 className="h-4 w-4 animate-spin" />}
                          <Switch
                            checked={checked}
                            disabled={inherited || savingAccess.has(savingKey)}
                            onCheckedChange={(enabled) => void setCategoryGroupAccess(group.id, enabled)}
                            aria-label={`Section access for ${group.name}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {filteredGroups.length === 0 && <p className="px-6 py-10 text-center text-sm text-muted-foreground">No groups match your search.</p>}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Add a category before assigning section access.</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="access" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>User Access</CardTitle>
              <p className="text-sm text-muted-foreground">
                Admins always have access. These grants allow every Request Hub section; use Section Access for narrower permissions.
              </p>
              <div className="relative max-w-md pt-2">
                <Search className="absolute left-3 top-5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users or groups" className="pl-9" />
              </div>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {filteredUsers.map((user) => {
                const inherited = user.role === "admin";
                const checked = inherited || grantedUserIds.has(user.id);
                const savingKey = `user:${user.id}`;
                return (
                  <div key={user.id} className="flex items-center justify-between gap-4 px-6 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{user.firstName} {user.lastName}</p>
                        <Badge variant="outline" className="capitalize">{user.role}</Badge>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="hidden text-xs text-muted-foreground sm:inline">{inherited ? "Always allowed" : checked ? "Allowed" : "No access"}</span>
                      {savingAccess.has(savingKey) && <Loader2 className="h-4 w-4 animate-spin" />}
                      <Switch
                        checked={checked}
                        disabled={inherited || savingAccess.has(savingKey)}
                        onCheckedChange={(enabled) => void setAccess(user.id, enabled)}
                        aria-label={`Request Hub access for ${user.firstName} ${user.lastName}`}
                      />
                    </div>
                  </div>
                );
              })}
              {filteredUsers.length === 0 && <p className="px-6 py-10 text-center text-sm text-muted-foreground">No users match your search.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5" />Group Access</CardTitle>
              <p className="text-sm text-muted-foreground">
                Members of an enabled group automatically receive Request Hub access.
              </p>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {filteredGroups.map((group) => {
                const checked = grantedGroupIds.has(group.id);
                const savingKey = `group:${group.id}`;
                return (
                  <div key={group.id} className="flex items-center justify-between gap-4 px-6 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{group.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                        {group.description ? ` · ${group.description}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="hidden text-xs text-muted-foreground sm:inline">{checked ? "Allowed" : "No access"}</span>
                      {savingAccess.has(savingKey) && <Loader2 className="h-4 w-4 animate-spin" />}
                      <Switch
                        checked={checked}
                        disabled={savingAccess.has(savingKey)}
                        onCheckedChange={(enabled) => void setGroupAccess(group.id, enabled)}
                        aria-label={`Request Hub access for ${group.name}`}
                      />
                    </div>
                  </div>
                );
              })}
              {filteredGroups.length === 0 && <p className="px-6 py-10 text-center text-sm text-muted-foreground">No groups match your search.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{categoryDraft.id ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <form onSubmit={saveCategory} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Category name</Label>
              <Input id="category-name" value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-description">Description</Label>
              <Textarea id="category-description" value={categoryDraft.description} onChange={(event) => setCategoryDraft({ ...categoryDraft, description: event.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category-order">Display order</Label>
                <Input id="category-order" type="number" value={categoryDraft.sortOrder} onChange={(event) => setCategoryDraft({ ...categoryDraft, sortOrder: Number(event.target.value) })} />
              </div>
              <div className="flex items-end gap-3 pb-2">
                <Switch checked={categoryDraft.isActive} onCheckedChange={(isActive) => setCategoryDraft({ ...categoryDraft, isActive })} id="category-visible" />
                <Label htmlFor="category-visible">Visible to users</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Category"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{requestDraft.id ? "Edit Request Card" : "Add Request Card"}</DialogTitle></DialogHeader>
          <form onSubmit={saveRequest} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={String(requestDraft.categoryId)} onValueChange={(value) => setRequestDraft({ ...requestDraft, categoryId: Number(value) })}>
                  <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
                  <SelectContent>{categories.map((category) => <SelectItem key={category.id} value={String(category.id)}>{category.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select value={requestDraft.icon} onValueChange={(icon) => setRequestDraft({ ...requestDraft, icon })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{facilitiesIconOptions.map((icon) => <SelectItem key={icon.value} value={icon.value}>{icon.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="request-eyebrow">Small category label</Label>
              <Input id="request-eyebrow" value={requestDraft.eyebrow} onChange={(event) => setRequestDraft({ ...requestDraft, eyebrow: event.target.value })} placeholder="Repairs & Maintenance" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="request-title">Request title</Label>
              <Input id="request-title" value={requestDraft.title} onChange={(event) => setRequestDraft({ ...requestDraft, title: event.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="request-description">Description</Label>
              <Textarea id="request-description" value={requestDraft.description} onChange={(event) => setRequestDraft({ ...requestDraft, description: event.target.value })} rows={3} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="request-use-when">“Use this when” guidance</Label>
              <Textarea id="request-use-when" value={requestDraft.useWhen} onChange={(event) => setRequestDraft({ ...requestDraft, useWhen: event.target.value })} rows={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="request-url">Destination link</Label>
              <Input id="request-url" type="url" value={requestDraft.url} onChange={(event) => setRequestDraft({ ...requestDraft, url: event.target.value })} placeholder="https://..." required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="request-button">Button text</Label>
                <Input id="request-button" value={requestDraft.buttonLabel} onChange={(event) => setRequestDraft({ ...requestDraft, buttonLabel: event.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="request-order">Display order</Label>
                <Input id="request-order" type="number" value={requestDraft.sortOrder} onChange={(event) => setRequestDraft({ ...requestDraft, sortOrder: Number(event.target.value) })} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={requestDraft.isActive} onCheckedChange={(isActive) => setRequestDraft({ ...requestDraft, isActive })} id="request-visible" />
              <Label htmlFor="request-visible">Visible to users</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRequestDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Request"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}