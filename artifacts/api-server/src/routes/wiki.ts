import { Router } from "express";
import {
  db,
  groupMembersTable,
  wikiAccessTable,
  wikiArticlesTable,
  wikiCategoriesTable,
  wikiGroupAccessTable,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { getAuth } from "../middlewares/auth";
import { getDbUser, requireAuth } from "../middlewares/requireAuth";

async function currentUser(req: Parameters<typeof getAuth>[0]) {
  const auth = getAuth(req);
  return auth?.userId ? getDbUser(auth.userId) : null;
}

export function createWikiRouter(wikiKey: string, wikiName: string) {
  const router = Router();

  async function canAccessWiki(user: { id: string; role: string }) {
    if (user.role === "admin") return true;
    const direct = await db.select({ id: wikiAccessTable.id }).from(wikiAccessTable)
      .where(and(eq(wikiAccessTable.wikiKey, wikiKey), eq(wikiAccessTable.userId, user.id))).limit(1);
    if (direct.length) return true;
    const inherited = await db.select({ id: wikiGroupAccessTable.id }).from(groupMembersTable)
      .innerJoin(wikiGroupAccessTable, eq(groupMembersTable.groupId, wikiGroupAccessTable.groupId))
      .where(and(eq(wikiGroupAccessTable.wikiKey, wikiKey), eq(groupMembersTable.userId, user.id))).limit(1);
    return inherited.length > 0;
  }

  router.get("/access", requireAuth, async (req, res) => {
    try {
      const user = await currentUser(req);
      if (!user) return void res.status(404).json({ error: "User not found" });
      res.json({ allowed: await canAccessWiki(user) });
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/", requireAuth, async (req, res) => {
    try {
      const user = await currentUser(req);
      if (!user) return void res.status(404).json({ error: "User not found" });
      if (!(await canAccessWiki(user))) {
        return void res.status(403).json({ error: `You do not have access to ${wikiName}.` });
      }
      const categories = await db.select().from(wikiCategoriesTable)
        .where(and(eq(wikiCategoriesTable.wikiKey, wikiKey), eq(wikiCategoriesTable.isActive, true)))
        .orderBy(asc(wikiCategoriesTable.sortOrder), asc(wikiCategoriesTable.id));
      const articles = await db.select({
        id: wikiArticlesTable.id,
        categoryId: wikiArticlesTable.categoryId,
        slug: wikiArticlesTable.slug,
        title: wikiArticlesTable.title,
        summary: wikiArticlesTable.summary,
        sortOrder: wikiArticlesTable.sortOrder,
      }).from(wikiArticlesTable)
        .where(and(eq(wikiArticlesTable.wikiKey, wikiKey), eq(wikiArticlesTable.isActive, true)))
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
      const user = await currentUser(req);
      if (!user) return void res.status(404).json({ error: "User not found" });
      if (!(await canAccessWiki(user))) return void res.status(404).json({ error: "Article not found" });
      const slug = String(req.params.slug || "").trim();
      if (!slug) return void res.status(400).json({ error: "Invalid article" });
      const rows = await db.select({
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
      }).from(wikiArticlesTable)
        .innerJoin(wikiCategoriesTable, and(
          eq(wikiArticlesTable.categoryId, wikiCategoriesTable.id),
          eq(wikiCategoriesTable.wikiKey, wikiKey),
        ))
        .where(and(
          eq(wikiArticlesTable.wikiKey, wikiKey),
          eq(wikiArticlesTable.slug, slug),
          eq(wikiArticlesTable.isActive, true),
          eq(wikiCategoriesTable.isActive, true),
        )).limit(1);
      if (!rows[0]) return void res.status(404).json({ error: "Article not found" });
      res.json(rows[0]);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

export default createWikiRouter("wiki", "the Wiki");