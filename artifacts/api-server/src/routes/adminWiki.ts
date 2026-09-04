import { Router } from "express";
import { db, wikiArticlesTable, wikiCategoriesTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { getAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAuth";

const router = Router();

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function longText(value: unknown, max = 200000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function integer(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function listCategories() {
  const categories = await db
    .select()
    .from(wikiCategoriesTable)
    .orderBy(asc(wikiCategoriesTable.sortOrder), asc(wikiCategoriesTable.id));
  const articles = await db
    .select()
    .from(wikiArticlesTable)
    .orderBy(asc(wikiArticlesTable.sortOrder), asc(wikiArticlesTable.id));
  return categories.map((category) => ({
    ...category,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    articles: articles
      .filter((article) => article.categoryId === category.id)
      .map((article) => ({
        ...article,
        createdAt: article.createdAt.toISOString(),
        updatedAt: article.updatedAt.toISOString(),
      })),
  }));
}

router.get("/", requireAdmin, async (_req, res) => {
  try {
    res.json(await listCategories());
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/categories/reorder", requireAdmin, async (req, res) => {
  try {
    const categoryIds = Array.isArray(req.body?.categoryIds) ? req.body.categoryIds.map(Number) : [];
    if (categoryIds.length === 0 || categoryIds.some((id: number) => !Number.isInteger(id) || id < 1) || new Set(categoryIds).size !== categoryIds.length) {
      res.status(400).json({ error: "categoryIds must contain unique category IDs" });
      return;
    }
    const existing = await db.select({ id: wikiCategoriesTable.id }).from(wikiCategoriesTable);
    if (existing.length !== categoryIds.length || existing.some((row) => !categoryIds.includes(row.id))) {
      res.status(400).json({ error: "categoryIds must include every category exactly once" });
      return;
    }
    await db.transaction(async (tx) => {
      for (const [sortOrder, id] of categoryIds.entries()) {
        await tx.update(wikiCategoriesTable).set({ sortOrder, updatedAt: new Date() }).where(eq(wikiCategoriesTable.id, id));
      }
    });
    res.json(await listCategories());
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/categories", requireAdmin, async (req, res) => {
  try {
    const name = text(req.body?.name, 120);
    if (!name) {
      res.status(400).json({ error: "Category name is required" });
      return;
    }
    const slug = text(req.body?.slug, 120) ? slugify(text(req.body.slug, 120)) : slugify(name);
    const rows = await db.insert(wikiCategoriesTable).values({
      slug,
      name,
      description: text(req.body?.description, 500) || null,
      sortOrder: integer(req.body?.sortOrder),
      isActive: req.body?.isActive !== false,
      createdByExternalUserId: getAuth(req)!.userId!,
    }).returning();
    res.status(201).json(rows[0]);
  } catch (err) {
    if (String(err).includes("wiki_categories_name_unique") || String(err).includes("wiki_categories_slug_unique")) {
      res.status(409).json({ error: "A category with this name already exists" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/categories/:categoryId", requireAdmin, async (req, res) => {
  try {
    const categoryId = Number(req.params.categoryId);
    if (!Number.isInteger(categoryId)) {
      res.status(400).json({ error: "Invalid category" });
      return;
    }
    const values: Partial<typeof wikiCategoriesTable.$inferInsert> = { updatedAt: new Date() };
    if ("name" in req.body) {
      const name = text(req.body.name, 120);
      if (!name) {
        res.status(400).json({ error: "Category name is required" });
        return;
      }
      values.name = name;
    }
    if ("slug" in req.body) {
      const slug = slugify(text(req.body.slug, 120));
      if (!slug) {
        res.status(400).json({ error: "Invalid slug" });
        return;
      }
      values.slug = slug;
    }
    if ("description" in req.body) values.description = text(req.body.description, 500) || null;
    if ("sortOrder" in req.body) values.sortOrder = integer(req.body.sortOrder);
    if ("isActive" in req.body && typeof req.body.isActive === "boolean") values.isActive = req.body.isActive;
    const rows = await db.update(wikiCategoriesTable).set(values).where(eq(wikiCategoriesTable.id, categoryId)).returning();
    if (!rows[0]) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    if (String(err).includes("wiki_categories_name_unique") || String(err).includes("wiki_categories_slug_unique")) {
      res.status(409).json({ error: "A category with this name or slug already exists" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/categories/:categoryId", requireAdmin, async (req, res) => {
  try {
    const categoryId = Number(req.params.categoryId);
    if (!Number.isInteger(categoryId)) {
      res.status(400).json({ error: "Invalid category" });
      return;
    }
    await db.delete(wikiCategoriesTable).where(eq(wikiCategoriesTable.id, categoryId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/articles", requireAdmin, async (req, res) => {
  try {
    const categoryId = integer(req.body?.categoryId, -1);
    const title = text(req.body?.title, 200);
    const content = longText(req.body?.content);
    if (categoryId < 1 || !title || !content) {
      res.status(400).json({ error: "Category, title, and content are required" });
      return;
    }
    const category = await db.select({ id: wikiCategoriesTable.id }).from(wikiCategoriesTable).where(eq(wikiCategoriesTable.id, categoryId)).limit(1);
    if (!category[0]) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    const slug = text(req.body?.slug, 160) ? slugify(text(req.body.slug, 160)) : slugify(title);
    const rows = await db.insert(wikiArticlesTable).values({
      categoryId,
      slug,
      title,
      summary: text(req.body?.summary, 500) || null,
      content,
      sortOrder: integer(req.body?.sortOrder),
      isActive: req.body?.isActive !== false,
      createdByExternalUserId: getAuth(req)!.userId!,
    }).returning();
    res.status(201).json(rows[0]);
  } catch (err) {
    if (String(err).includes("wiki_articles_slug_unique")) {
      res.status(409).json({ error: "An article with this slug already exists" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/articles/:articleId", requireAdmin, async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);
    if (!Number.isInteger(articleId)) {
      res.status(400).json({ error: "Invalid article" });
      return;
    }
    const values: Partial<typeof wikiArticlesTable.$inferInsert> = { updatedAt: new Date() };
    if ("categoryId" in req.body) {
      const categoryId = integer(req.body.categoryId, -1);
      if (categoryId < 1) {
        res.status(400).json({ error: "A valid category is required" });
        return;
      }
      values.categoryId = categoryId;
    }
    if ("title" in req.body) {
      const title = text(req.body.title, 200);
      if (!title) {
        res.status(400).json({ error: "Title is required" });
        return;
      }
      values.title = title;
    }
    if ("slug" in req.body) {
      const slug = slugify(text(req.body.slug, 160));
      if (!slug) {
        res.status(400).json({ error: "Invalid slug" });
        return;
      }
      values.slug = slug;
    }
    if ("summary" in req.body) values.summary = text(req.body.summary, 500) || null;
    if ("content" in req.body) {
      const content = longText(req.body.content);
      if (!content) {
        res.status(400).json({ error: "Content is required" });
        return;
      }
      values.content = content;
    }
    if ("sortOrder" in req.body) values.sortOrder = integer(req.body.sortOrder);
    if ("isActive" in req.body && typeof req.body.isActive === "boolean") values.isActive = req.body.isActive;
    const rows = await db.update(wikiArticlesTable).set(values).where(eq(wikiArticlesTable.id, articleId)).returning();
    if (!rows[0]) {
      res.status(404).json({ error: "Article not found" });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    if (String(err).includes("wiki_articles_slug_unique")) {
      res.status(409).json({ error: "An article with this slug already exists" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/articles/:articleId", requireAdmin, async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);
    if (!Number.isInteger(articleId)) {
      res.status(400).json({ error: "Invalid article" });
      return;
    }
    await db.delete(wikiArticlesTable).where(eq(wikiArticlesTable.id, articleId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
