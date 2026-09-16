import { useEffect, useMemo, useState } from "react";
import { useAdminListUsers } from "@workspace/api-client-react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  Upload,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { WikiMarkdown } from "@/components/wiki/WikiMarkdown";
import { wikiApi, type WikiAdminArticle, type WikiAdminCategory } from "@/lib/wiki";

type CategoryDraft = {
  id?: number;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
};

type ArticleDraft = {
  id?: number;
  categoryId: number;
  title: string;
  slug: string;
  summary: string;
  content: string;
  sortOrder: number;
  isActive: boolean;
};

type WikiAccessGrant = { userId: string };
type WikiGroupAccessGrant = { groupId: number };
type WikiGroup = { id: number; name: string; description?: string | null; memberCount: number };
type WikiImportPreview = {
  categories: { create: number; update: number };
  articles: { create: number; update: number };
  grants: { usersResolved: number; groupsResolved: number };
  unresolvedUserEmails: string[];
  unresolvedGroupNames: string[];
  errors: string[];
  canConfirm: boolean;
};

const emptyCategory: CategoryDraft = { name: "", slug: "", description: "", sortOrder: 0, isActive: true };

const emptyArticle = (categoryId = 0): ArticleDraft => ({
  categoryId,
  title: "",
  slug: "",
  summary: "",
  content: "",
  sortOrder: 0,
  isActive: true,
});

type AdminWikiProps = {
  wikiKey?: "wiki" | "tc-wiki";
  wikiName?: string;
};

export default function AdminWiki({ wikiKey = "wiki", wikiName = "Wiki" }: AdminWikiProps) {
  const apiPrefix = `/api/admin/${wikiKey}`;
  const { data: users } = useAdminListUsers();
  const { toast } = useToast();
  const [categories, setCategories] = useState<WikiAdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [articleDialogOpen, setArticleDialogOpen] = useState(false);
  const [previewArticle, setPreviewArticle] = useState<ArticleDraft | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategory);
  const [articleDraft, setArticleDraft] = useState<ArticleDraft>(emptyArticle());
  const [saving, setSaving] = useState(false);
  const [accessGrants, setAccessGrants] = useState<WikiAccessGrant[]>([]);
  const [groupAccessGrants, setGroupAccessGrants] = useState<WikiGroupAccessGrant[]>([]);
  const [groups, setGroups] = useState<WikiGroup[]>([]);
  const [accessSearch, setAccessSearch] = useState("");
  const [savingAccess, setSavingAccess] = useState<Set<string>>(new Set());
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importBundle, setImportBundle] = useState<unknown>(null);
  const [importPreview, setImportPreview] = useState<WikiImportPreview | null>(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [catalog, directAccess, groupAccess, availableGroups] = await Promise.all([
        wikiApi<WikiAdminCategory[]>(apiPrefix),
        wikiApi<WikiAccessGrant[]>(`${apiPrefix}/access`),
        wikiApi<WikiGroupAccessGrant[]>(`${apiPrefix}/access/groups`),
        wikiApi<WikiGroup[]>("/api/groups"),
      ]);
      setCategories(catalog);
      setAccessGrants(directAccess);
      setGroupAccessGrants(groupAccess);
      setGroups(availableGroups);
    } catch (err) {
      toast({ title: "Wiki could not be loaded", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const grantedUserIds = useMemo(() => new Set(accessGrants.map((grant) => grant.userId)), [accessGrants]);
  const grantedGroupIds = useMemo(() => new Set(groupAccessGrants.map((grant) => grant.groupId)), [groupAccessGrants]);
  const normalizedAccessSearch = accessSearch.trim().toLowerCase();
  const filteredUsers = useMemo(() => (users ?? []).filter((user) =>
    !normalizedAccessSearch
    || `${user.firstName} ${user.lastName} ${user.email} ${user.role}`.toLowerCase().includes(normalizedAccessSearch)
  ), [users, normalizedAccessSearch]);
  const filteredGroups = useMemo(() => groups.filter((group) =>
    !normalizedAccessSearch
    || `${group.name} ${group.description ?? ""}`.toLowerCase().includes(normalizedAccessSearch)
  ), [groups, normalizedAccessSearch]);

  const refreshAccess = async () => {
    const [directAccess, groupAccess] = await Promise.all([
      wikiApi<WikiAccessGrant[]>(`${apiPrefix}/access`),
      wikiApi<WikiGroupAccessGrant[]>(`${apiPrefix}/access/groups`),
    ]);
    setAccessGrants(directAccess);
    setGroupAccessGrants(groupAccess);
  };

  const setUserAccess = async (userId: string, enabled: boolean) => {
    const key = `user:${userId}`;
    setSavingAccess((current) => new Set(current).add(key));
    try {
      await wikiApi(`${apiPrefix}/access/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      await refreshAccess();
      toast({ title: enabled ? "Wiki access granted" : "Wiki access removed" });
    } catch (err) {
      toast({ title: "Access could not be updated", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingAccess((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const setGroupAccess = async (groupId: number, enabled: boolean) => {
    const key = `group:${groupId}`;
    setSavingAccess((current) => new Set(current).add(key));
    try {
      await wikiApi(`${apiPrefix}/access/groups/${groupId}`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      await refreshAccess();
      toast({ title: enabled ? "Group access granted" : "Group access removed" });
    } catch (err) {
      toast({ title: "Access could not be updated", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingAccess((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const openNewCategory = () => {
    setCategoryDraft({ ...emptyCategory, sortOrder: categories.length });
    setCategoryDialogOpen(true);
  };

  const openEditCategory = (category: WikiAdminCategory) => {
    setCategoryDraft({
      id: category.id,
      name: category.name,
      slug: category.slug,
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
      await wikiApi(
        categoryDraft.id ? `${apiPrefix}/categories/${categoryDraft.id}` : `${apiPrefix}/categories`,
        { method: categoryDraft.id ? "PATCH" : "POST", body: JSON.stringify(categoryDraft) },
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

  const deleteCategory = async (category: WikiAdminCategory) => {
    const warning = category.articles.length
      ? `Delete "${category.name}" and its ${category.articles.length} article${category.articles.length === 1 ? "" : "s"}?`
      : `Delete "${category.name}"?`;
    if (!window.confirm(warning)) return;
    try {
      await wikiApi(`${apiPrefix}/categories/${category.id}`, { method: "DELETE" });
      toast({ title: "Category deleted" });
      await load();
    } catch (err) {
      toast({ title: "Category could not be deleted", description: (err as Error).message, variant: "destructive" });
    }
  };

  const moveCategory = async (categoryIndex: number, direction: -1 | 1) => {
    const targetIndex = categoryIndex + direction;
    if (targetIndex < 0 || targetIndex >= categories.length) return;
    const reordered = [...categories];
    [reordered[categoryIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[categoryIndex]];
    setCategories(reordered.map((category, sortOrder) => ({ ...category, sortOrder })));
    try {
      const next = await wikiApi<WikiAdminCategory[]>(`${apiPrefix}/categories/reorder`, {
        method: "PUT",
        body: JSON.stringify({ categoryIds: reordered.map((category) => category.id) }),
      });
      setCategories(next);
    } catch (err) {
      toast({ title: "Category order could not be updated", description: (err as Error).message, variant: "destructive" });
      await load();
    }
  };

  const openNewArticle = (categoryId?: number) => {
    setArticleDraft(emptyArticle(categoryId ?? categories[0]?.id ?? 0));
    setArticleDialogOpen(true);
  };

  const openEditArticle = (article: WikiAdminArticle) => {
    setArticleDraft({
      id: article.id,
      categoryId: article.categoryId,
      title: article.title,
      slug: article.slug,
      summary: article.summary ?? "",
      content: article.content,
      sortOrder: article.sortOrder,
      isActive: article.isActive,
    });
    setArticleDialogOpen(true);
  };

  const saveArticle = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await wikiApi(
        articleDraft.id ? `${apiPrefix}/articles/${articleDraft.id}` : `${apiPrefix}/articles`,
        { method: articleDraft.id ? "PATCH" : "POST", body: JSON.stringify(articleDraft) },
      );
      toast({ title: articleDraft.id ? "Article updated" : "Article added" });
      setArticleDialogOpen(false);
      await load();
    } catch (err) {
      toast({ title: "Article could not be saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteArticle = async (article: WikiAdminArticle) => {
    if (!window.confirm(`Delete "${article.title}"?`)) return;
    try {
      await wikiApi(`${apiPrefix}/articles/${article.id}`, { method: "DELETE" });
      toast({ title: "Article deleted" });
      await load();
    } catch (err) {
      toast({ title: "Article could not be deleted", description: (err as Error).message, variant: "destructive" });
    }
  };

  const downloadExport = async () => {
    try {
      const bundle = await wikiApi<unknown>(`${apiPrefix}/export`);
      const blob = new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${wikiKey}-content-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Wiki content downloaded" });
    } catch (err) {
      toast({ title: "Wiki content could not be downloaded", description: (err as Error).message, variant: "destructive" });
    }
  };

  const chooseImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setImportPreview(null);
    setImportBundle(null);
    setImportFileName(file?.name ?? "");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File is too large", description: "Wiki imports must be 5 MB or smaller.", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      const bundle = JSON.parse(await file.text()) as unknown;
      const preview = await wikiApi<WikiImportPreview>(`${apiPrefix}/import/preview`, {
        method: "POST",
        body: JSON.stringify(bundle),
      });
      setImportBundle(bundle);
      setImportPreview(preview);
    } catch (err) {
      toast({ title: "Import file could not be read", description: (err as Error).message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = async () => {
    if (!importBundle || !importPreview?.canConfirm) return;
    setImporting(true);
    try {
      const result = await wikiApi<WikiImportPreview & { userGrantsImported: number; groupGrantsImported: number }>(
        `${apiPrefix}/import/confirm`,
        { method: "POST", body: JSON.stringify(importBundle) },
      );
      toast({
        title: "Wiki import complete",
        description: `${result.categories.create + result.categories.update} categories, ${result.articles.create + result.articles.update} articles, ${result.userGrantsImported} user grants, and ${result.groupGrantsImported} group grants imported.`,
      });
      setImportDialogOpen(false);
      setImportBundle(null);
      setImportPreview(null);
      setImportFileName("");
      await load();
    } catch (err) {
      toast({ title: "Wiki import failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-serif">{wikiName}</h1>
          <p className="mt-2 text-muted-foreground">
            Manage the categories, articles, and access for {wikiName}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void downloadExport()}>
            <Download className="mr-2 h-4 w-4" />Download JSON
          </Button>
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />Import JSON
          </Button>
          <Button variant="outline" onClick={openNewCategory}>
            <Plus className="mr-2 h-4 w-4" />Add Category
          </Button>
          <Button onClick={() => openNewArticle()} disabled={categories.length === 0}>
            <Plus className="mr-2 h-4 w-4" />Add Article
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />{wikiName} Access</CardTitle>
          <p className="text-sm text-muted-foreground">
            Admins always have access. Enable individual people or groups below; every member of an enabled group inherits access.
          </p>
          <div className="relative max-w-md pt-2">
            <Search className="absolute left-3 top-5 h-4 w-4 text-muted-foreground" />
            <Input value={accessSearch} onChange={(event) => setAccessSearch(event.target.value)} placeholder="Search users or groups" className="pl-9" />
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>User Access</CardTitle></CardHeader>
          <CardContent className="max-h-[32rem] divide-y overflow-y-auto p-0">
            {filteredUsers.map((user) => {
              const inherited = user.role === "admin";
              const checked = inherited || grantedUserIds.has(user.id);
              const key = `user:${user.id}`;
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
                    {savingAccess.has(key) && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Switch checked={checked} disabled={inherited || savingAccess.has(key)} onCheckedChange={(enabled) => void setUserAccess(user.id, enabled)} aria-label={`Wiki access for ${user.firstName} ${user.lastName}`} />
                  </div>
                </div>
              );
            })}
            {filteredUsers.length === 0 && <p className="px-6 py-10 text-center text-sm text-muted-foreground">No users match your search.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5" />Group Access</CardTitle></CardHeader>
          <CardContent className="max-h-[32rem] divide-y overflow-y-auto p-0">
            {filteredGroups.map((group) => {
              const checked = grantedGroupIds.has(group.id);
              const key = `group:${group.id}`;
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
                    {savingAccess.has(key) && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Switch checked={checked} disabled={savingAccess.has(key)} onCheckedChange={(enabled) => void setGroupAccess(group.id, enabled)} aria-label={`Wiki access for ${group.name}`} />
                  </div>
                </div>
              );
            })}
            {filteredGroups.length === 0 && <p className="px-6 py-10 text-center text-sm text-muted-foreground">No groups match your search.</p>}
          </CardContent>
        </Card>
      </div>

      {categories.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Add a category to begin building the wiki.</CardContent></Card>
      ) : categories.map((category, categoryIndex) => (
        <Card key={category.id} className={!category.isActive ? "opacity-70" : ""}>
          <CardHeader className="gap-4 border-b sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{category.name}</CardTitle>
                <Badge variant={category.isActive ? "default" : "secondary"}>{category.isActive ? "Visible" : "Hidden"}</Badge>
                <span className="text-xs text-muted-foreground">/{category.slug}</span>
              </div>
              {category.description && <p className="mt-2 text-sm text-muted-foreground">{category.description}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="icon" variant="outline" aria-label={`Move ${category.name} up`} disabled={categoryIndex === 0} onClick={() => void moveCategory(categoryIndex, -1)}>
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" aria-label={`Move ${category.name} down`} disabled={categoryIndex === categories.length - 1} onClick={() => void moveCategory(categoryIndex, 1)}>
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => openNewArticle(category.id)}>
                <Plus className="mr-1 h-4 w-4" />Article
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
            {category.articles.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No articles in this category yet.</p>
            ) : (
              <div className="divide-y">
                {category.articles.map((article) => (
                  <div key={article.id} className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-start ${!article.isActive ? "bg-muted/40 opacity-70" : ""}`}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{article.title}</p>
                        <Badge variant={article.isActive ? "outline" : "secondary"}>{article.isActive ? "Visible" : "Hidden"}</Badge>
                        <span className="text-xs text-muted-foreground">/wiki/{article.slug}</span>
                      </div>
                      {article.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{article.summary}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Preview ${article.title}`} onClick={() => setPreviewArticle({ id: article.id, categoryId: article.categoryId, title: article.title, slug: article.slug, summary: article.summary ?? "", content: article.content, sortOrder: article.sortOrder, isActive: article.isActive })}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Edit ${article.title}`} onClick={() => openEditArticle(article)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${article.title}`} onClick={() => deleteArticle(article)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{categoryDraft.id ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <form onSubmit={saveCategory} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wiki-category-name">Category name</Label>
              <Input id="wiki-category-name" value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiki-category-slug">Slug (optional — used in the URL, auto-generated from the name if left blank)</Label>
              <Input id="wiki-category-slug" value={categoryDraft.slug} onChange={(event) => setCategoryDraft({ ...categoryDraft, slug: event.target.value })} placeholder="e.g. workplace-policies" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiki-category-description">Description</Label>
              <Textarea id="wiki-category-description" value={categoryDraft.description} onChange={(event) => setCategoryDraft({ ...categoryDraft, description: event.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wiki-category-order">Display order</Label>
                <Input id="wiki-category-order" type="number" value={categoryDraft.sortOrder} onChange={(event) => setCategoryDraft({ ...categoryDraft, sortOrder: Number(event.target.value) })} />
              </div>
              <div className="flex items-end gap-3 pb-2">
                <Switch checked={categoryDraft.isActive} onCheckedChange={(isActive) => setCategoryDraft({ ...categoryDraft, isActive })} id="wiki-category-visible" />
                <Label htmlFor="wiki-category-visible">Visible to users</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Category"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={(open) => {
        setImportDialogOpen(open);
        if (!open) {
          setImportBundle(null);
          setImportPreview(null);
          setImportFileName("");
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import {wikiName} content</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="wiki-import-file">Wiki JSON file</Label>
              <Input id="wiki-import-file" type="file" accept=".json,application/json" onChange={(event) => void chooseImportFile(event)} />
              <p className="text-xs text-muted-foreground">
                Upload one JSON file containing categories, articles, userGrants, and groupGrants. Previewing does not change the database.
              </p>
            </div>

            {importing && (
              <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {importPreview ? "Importing Wiki content..." : "Checking import file..."}
              </div>
            )}

            {importPreview && !importing && (
              <div className="space-y-4">
                <div className="rounded-md border p-4">
                  <p className="font-medium">Preview: {importFileName}</p>
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded bg-muted p-3">
                      <p className="font-medium">Categories</p>
                      <p className="text-muted-foreground">{importPreview.categories.create} create · {importPreview.categories.update} update</p>
                    </div>
                    <div className="rounded bg-muted p-3">
                      <p className="font-medium">Articles</p>
                      <p className="text-muted-foreground">{importPreview.articles.create} create · {importPreview.articles.update} update</p>
                    </div>
                    <div className="rounded bg-muted p-3">
                      <p className="font-medium">User grants</p>
                      <p className="text-muted-foreground">{importPreview.grants.usersResolved} resolved · {importPreview.unresolvedUserEmails.length} unresolved</p>
                    </div>
                    <div className="rounded bg-muted p-3">
                      <p className="font-medium">Group grants</p>
                      <p className="text-muted-foreground">{importPreview.grants.groupsResolved} resolved · {importPreview.unresolvedGroupNames.length} unresolved</p>
                    </div>
                  </div>
                </div>

                {importPreview.errors.length > 0 && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4">
                    <p className="font-medium text-destructive">Fix these errors before importing</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
                      {importPreview.errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}
                    </ul>
                  </div>
                )}

                {(importPreview.unresolvedUserEmails.length > 0 || importPreview.unresolvedGroupNames.length > 0) && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4">
                    <p className="font-medium">Unresolved access grants</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      These grants will not be imported unless the matching user or group exists in this environment.
                    </p>
                    {importPreview.unresolvedUserEmails.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-medium">Users</p>
                        <ul className="list-disc pl-5 text-sm text-muted-foreground">
                          {importPreview.unresolvedUserEmails.map((email) => <li key={email}>{email}</li>)}
                        </ul>
                      </div>
                    )}
                    {importPreview.unresolvedGroupNames.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-medium">Groups</p>
                        <ul className="list-disc pl-5 text-sm text-muted-foreground">
                          {importPreview.unresolvedGroupNames.map((name) => <li key={name}>{name}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportDialogOpen(false)} disabled={importing}>Cancel</Button>
            <Button type="button" onClick={() => void confirmImport()} disabled={importing || !importPreview?.canConfirm}>
              {importing ? "Importing..." : "Confirm Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={articleDialogOpen} onOpenChange={setArticleDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{articleDraft.id ? "Edit Article" : "Add Article"}</DialogTitle></DialogHeader>
          <form onSubmit={saveArticle} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={String(articleDraft.categoryId)} onValueChange={(value) => setArticleDraft({ ...articleDraft, categoryId: Number(value) })}>
                  <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
                  <SelectContent>{categories.map((category) => <SelectItem key={category.id} value={String(category.id)}>{category.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wiki-article-slug">Slug (optional — auto-generated from the title if left blank)</Label>
                <Input id="wiki-article-slug" value={articleDraft.slug} onChange={(event) => setArticleDraft({ ...articleDraft, slug: event.target.value })} placeholder="e.g. staff-team-code" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiki-article-title">Title</Label>
              <Input id="wiki-article-title" value={articleDraft.title} onChange={(event) => setArticleDraft({ ...articleDraft, title: event.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiki-article-summary">Summary (shown on the article card)</Label>
              <Textarea id="wiki-article-summary" value={articleDraft.summary} onChange={(event) => setArticleDraft({ ...articleDraft, summary: event.target.value })} rows={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiki-article-content">
                Content — supports <code>## Heading</code>, <code>### Subheading</code>, <code>- bullet</code>, <code>1. numbered</code>, <code>**bold**</code>, and <code>[link text](https://url)</code>. Nothing else.
              </Label>
              <Textarea id="wiki-article-content" value={articleDraft.content} onChange={(event) => setArticleDraft({ ...articleDraft, content: event.target.value })} rows={16} className="font-mono text-sm" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wiki-article-order">Display order</Label>
                <Input id="wiki-article-order" type="number" value={articleDraft.sortOrder} onChange={(event) => setArticleDraft({ ...articleDraft, sortOrder: Number(event.target.value) })} />
              </div>
              <div className="flex items-end gap-3 pb-2">
                <Switch checked={articleDraft.isActive} onCheckedChange={(isActive) => setArticleDraft({ ...articleDraft, isActive })} id="wiki-article-visible" />
                <Label htmlFor="wiki-article-visible">Visible to users</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setArticleDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Article"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewArticle} onOpenChange={(open) => !open && setPreviewArticle(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{previewArticle?.title}</DialogTitle></DialogHeader>
          {previewArticle && <WikiMarkdown content={previewArticle.content} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
