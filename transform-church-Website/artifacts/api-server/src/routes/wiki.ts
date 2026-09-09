import { Router } from "express";
import { db, wikiArticlesTable, wikiCategoriesTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/", requireAuth, async (_req, res) => {
  try {
    const categories = await db
      .select()
      .from(wikiCategoriesTable)
      .where(eq(wikiCategoriesTable.isActive, true))
      .orderBy(asc(wikiCategoriesTable.sortOrder), asc(wikiCategoriesTable.id));
    const articles = await db
      .select({
        id: wikiArticlesTable.id,
        categoryId: wikiArticlesTable.categoryId,
        slug: wikiArticlesTable.slug,
        title: wikiArticlesTable.title,
        summary: wikiArticlesTable.summary,
        sortOrder: wikiArticlesTable.sortOrder,
      })
      .from(wikiArticlesTable)
      .where(eq(wikiArticlesTable.isActive, true))
      .orderBy(asc(wikiArticlesTable.sortOrder), asc(wikiArticlesTable.id));

    res.json(categories.map((category) => ({
      ...category,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
      articles: articles.filter((article) => article.categoryId === category.id),
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/articles/:slug", requireAuth, async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      res.status(400).json({ error: "Invalid article" });
      return;
    }
    const rows = await db
      .select({
        id: wikiArticlesTable.id,
        categoryId: wikiArticlesTable.categoryId,
        slug: wikiArticlesTable.slug,
        title: wikiArticlesTable.title,
        summary: wikiArticlesTable.summary,
        content: wikiArticlesTable.content,
        sortOrder: wikiArticlesTable.sortOrder,
        isActive: wikiArticlesTable.isActive,
        categoryName: wikiCategoriesTable.name,
        categorySlug: wikiCategoriesTable.slug,
      })
      .from(wikiArticlesTable)
      .innerJoin(wikiCategoriesTable, eq(wikiArticlesTable.categoryId, wikiCategoriesTable.id))
      .where(and(eq(wikiArticlesTable.slug, slug), eq(wikiArticlesTable.isActive, true), eq(wikiCategoriesTable.isActive, true)))
      .limit(1);
    if (!rows[0]) {
      res.status(404).json({ error: "Article not found" });
      return;
    }
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
