import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Trash2,
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

export default function AdminWiki() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<WikiAdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [articleDialogOpen, setArticleDialogOpen] = useState(false);
  const [previewArticle, setPreviewArticle] = useState<ArticleDraft | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategory);
  const [articleDraft, setArticleDraft] = useState<ArticleDraft>(emptyArticle());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setCategories(await wikiApi<WikiAdminCategory[]>("/api/admin/wiki"));
    } catch (err) {
      toast({ title: "Wiki could not be loaded", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

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
        categoryDraft.id ? `/api/admin/wiki/categories/${categoryDraft.id}` : "/api/admin/wiki/categories",
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
      await wikiApi(`/api/admin/wiki/categories/${category.id}`, { method: "DELETE" });
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
      const next = await wikiApi<WikiAdminCategory[]>("/api/admin/wiki/categories/reorder", {
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
        articleDraft.id ? `/api/admin/wiki/articles/${articleDraft.id}` : "/api/admin/wiki/articles",
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
      await wikiApi(`/api/admin/wiki/articles/${article.id}`, { method: "DELETE" });
      toast({ title: "Article deleted" });
      await load();
    } catch (err) {
      toast({ title: "Article could not be deleted", description: (err as Error).message, variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-serif">Wiki</h1>
          <p className="mt-2 text-muted-foreground">
            Manage the categories and articles that make up the staff Wiki.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openNewCategory}>
            <Plus className="mr-2 h-4 w-4" />Add Category
          </Button>
          <Button onClick={() => openNewArticle()} disabled={categories.length === 0}>
            <Plus className="mr-2 h-4 w-4" />Add Article
          </Button>
        </div>
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
