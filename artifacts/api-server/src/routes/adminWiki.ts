import { json, Router } from "express";
import {
  db,
  groupMembersTable,
  groupsTable,
  usersTable,
  wikiAccessTable,
  wikiArticlesTable,
  wikiCategoriesTable,
  wikiGroupAccessTable,
} from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { getAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAuth";

const router = Router();

type WikiImportCategory = {
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

type WikiImportArticle = {
  categorySlug: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  sortOrder: number;
  isActive: boolean;
};

type WikiImportUserGrant = { userEmail: string; grantedAt: string };
type WikiImportGroupGrant = { groupName: string; grantedAt: string };
type WikiImportBundle = {
  categories: WikiImportCategory[];
  articles: WikiImportArticle[];
  userGrants: WikiImportUserGrant[];
  groupGrants: WikiImportGroupGrant[];
};

type WikiImportPreview = {
  categories: { create: number; update: number };
  articles: { create: number; update: number };
  grants: { usersResolved: number; groupsResolved: number };
  unresolvedUserEmails: string[];
  unresolvedGroupNames: string[];
  errors: string[];
  canConfirm: boolean;
};

const wikiImportJson = json({ limit: "5mb" });

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

function parseImportBundle(value: unknown): { bundle: WikiImportBundle | null; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { bundle: null, errors: ["The uploaded file must contain a JSON object."] };
  }
  const input = value as Record<string, unknown>;
  const array = (key: string) => {
    if (!Array.isArray(input[key])) {
      errors.push(`${key} must be an array.`);
      return [];
    }
    return input[key] as unknown[];
  };
  const requiredString = (item: Record<string, unknown>, key: string, path: string, max: number) => {
    if (typeof item[key] !== "string" || !item[key].trim()) {
      errors.push(`${path}.${key} is required.`);
      return "";
    }
    if ((item[key] as string).length > max) errors.push(`${path}.${key} must be ${max} characters or fewer.`);
    return (item[key] as string).trim().slice(0, max);
  };
  const optionalString = (item: Record<string, unknown>, key: string, path: string, max: number) => {
    if (item[key] == null || item[key] === "") return null;
    if (typeof item[key] !== "string") {
      errors.push(`${path}.${key} must be text or null.`);
      return null;
    }
    if ((item[key] as string).length > max) errors.push(`${path}.${key} must be ${max} characters or fewer.`);
    return (item[key] as string).slice(0, max);
  };
  const importInteger = (item: Record<string, unknown>, key: string, path: string) => {
    if (!Number.isInteger(item[key])) {
      errors.push(`${path}.${key} must be an integer.`);
      return 0;
    }
    return item[key] as number;
  };
  const importBoolean = (item: Record<string, unknown>, key: string, path: string) => {
    if (typeof item[key] !== "boolean") {
      errors.push(`${path}.${key} must be true or false.`);
      return true;
    }
    return item[key] as boolean;
  };
  const record = (item: unknown, path: string) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${path} must be an object.`);
      return {} as Record<string, unknown>;
    }
    return item as Record<string, unknown>;
  };
  const timestamp = (item: Record<string, unknown>, key: string, path: string) => {
    const raw = requiredString(item, key, path, 100);
    if (raw && Number.isNaN(Date.parse(raw))) errors.push(`${path}.${key} must be a valid date and time.`);
    return raw;
  };

  const categories = array("categories").map((raw, index) => {
    const path = `categories[${index}]`;
    const item = record(raw, path);
    const rawSlug = requiredString(item, "slug", path, 120);
    const slug = slugify(rawSlug);
    if (rawSlug && slug !== rawSlug) errors.push(`${path}.slug must already be a lowercase URL slug.`);
    return {
      slug,
      name: requiredString(item, "name", path, 120),
      description: optionalString(item, "description", path, 500),
      sortOrder: importInteger(item, "sortOrder", path),
      isActive: importBoolean(item, "isActive", path),
    };
  });
  const articles = array("articles").map((raw, index) => {
    const path = `articles[${index}]`;
    const item = record(raw, path);
    const rawCategorySlug = requiredString(item, "categorySlug", path, 120);
    const rawSlug = requiredString(item, "slug", path, 160);
    const categorySlug = slugify(rawCategorySlug);
    const slug = slugify(rawSlug);
    if (rawCategorySlug && categorySlug !== rawCategorySlug) errors.push(`${path}.categorySlug must already be a lowercase URL slug.`);
    if (rawSlug && slug !== rawSlug) errors.push(`${path}.slug must already be a lowercase URL slug.`);
    return {
      categorySlug,
      slug,
      title: requiredString(item, "title", path, 200),
      summary: optionalString(item, "summary", path, 500),
      content: requiredString(item, "content", path, 200000),
      sortOrder: importInteger(item, "sortOrder", path),
      isActive: importBoolean(item, "isActive", path),
    };
  });
  const userGrants = array("userGrants").map((raw, index) => {
    const path = `userGrants[${index}]`;
    const item = record(raw, path);
    return {
      userEmail: requiredString(item, "userEmail", path, 320).toLowerCase(),
      grantedAt: timestamp(item, "grantedAt", path),
    };
  });
  const groupGrants = array("groupGrants").map((raw, index) => {
    const path = `groupGrants[${index}]`;
    const item = record(raw, path);
    return {
      groupName: requiredString(item, "groupName", path, 200),
      grantedAt: timestamp(item, "grantedAt", path),
    };
  });

  const duplicates = (values: string[], label: string) => {
    const seen = new Set<string>();
    const duplicate = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) duplicate.add(value);
      seen.add(value);
    }
    for (const value of duplicate) errors.push(`${label} contains duplicate value "${value}".`);
  };
  duplicates(categories.map((item) => item.slug), "Category slugs");
  duplicates(categories.map((item) => item.name.toLowerCase()), "Category names");
  duplicates(articles.map((item) => item.slug), "Article slugs");
  duplicates(userGrants.map((item) => item.userEmail), "User grant emails");
  duplicates(groupGrants.map((item) => item.groupName.toLowerCase()), "Group grant names");

  return { bundle: { categories, articles, userGrants, groupGrants }, errors };
}

async function previewImport(bundle: WikiImportBundle, validationErrors: string[]): Promise<WikiImportPreview> {
  const [categories, articles, users, groups] = await Promise.all([
    db.select({ slug: wikiCategoriesTable.slug, name: wikiCategoriesTable.name }).from(wikiCategoriesTable),
    db.select({ slug: wikiArticlesTable.slug }).from(wikiArticlesTable),
    db.select({ email: usersTable.email }).from(usersTable),
    db.select({ name: groupsTable.name }).from(groupsTable),
  ]);
  const existingCategorySlugs = new Set(categories.map((item) => item.slug));
  const existingCategoryNames = new Map(categories.map((item) => [item.name.toLowerCase(), item.slug]));
  const availableCategorySlugs = new Set([...existingCategorySlugs, ...bundle.categories.map((item) => item.slug)]);
  const existingArticleSlugs = new Set(articles.map((item) => item.slug));
  const userEmailCounts = new Map<string, number>();
  const groupNameCounts = new Map<string, number>();
  for (const user of users) {
    const email = user.email.toLowerCase();
    userEmailCounts.set(email, (userEmailCounts.get(email) ?? 0) + 1);
  }
  for (const group of groups) {
    const name = group.name.toLowerCase();
    groupNameCounts.set(name, (groupNameCounts.get(name) ?? 0) + 1);
  }
  const errors = [...validationErrors];
  for (const category of bundle.categories) {
    const conflictingSlug = existingCategoryNames.get(category.name.toLowerCase());
    if (conflictingSlug && conflictingSlug !== category.slug) {
      errors.push(`Category name "${category.name}" is already used by slug "${conflictingSlug}".`);
    }
  }
  for (const article of bundle.articles) {
    if (!availableCategorySlugs.has(article.categorySlug)) {
      errors.push(`Article "${article.slug}" references missing category "${article.categorySlug}".`);
    }
  }
  const unresolvedUserEmails = bundle.userGrants
    .map((item) => item.userEmail)
    .filter((email) => !userEmailCounts.has(email));
  const unresolvedGroupNames = bundle.groupGrants
    .map((item) => item.groupName)
    .filter((name) => !groupNameCounts.has(name.toLowerCase()));
  for (const email of bundle.userGrants.map((item) => item.userEmail)) {
    if ((userEmailCounts.get(email) ?? 0) > 1) {
      errors.push(`User grant email "${email}" matches multiple users.`);
    }
  }
  for (const name of bundle.groupGrants.map((item) => item.groupName)) {
    if ((groupNameCounts.get(name.toLowerCase()) ?? 0) > 1) {
      errors.push(`Group grant name "${name}" matches multiple groups.`);
    }
  }
  return {
    categories: {
      create: bundle.categories.filter((item) => !existingCategorySlugs.has(item.slug)).length,
      update: bundle.categories.filter((item) => existingCategorySlugs.has(item.slug)).length,
    },
    articles: {
      create: bundle.articles.filter((item) => !existingArticleSlugs.has(item.slug)).length,
      update: bundle.articles.filter((item) => existingArticleSlugs.has(item.slug)).length,
    },
    grants: {
      usersResolved: bundle.userGrants.length - unresolvedUserEmails.length,
      groupsResolved: bundle.groupGrants.length - unresolvedGroupNames.length,
    },
    unresolvedUserEmails,
    unresolvedGroupNames,
    errors,
    canConfirm: errors.length === 0,
  };
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

router.get("/access", requireAdmin, async (_req, res) => {
  try {
    const grants = await db.select().from(wikiAccessTable).orderBy(asc(wikiAccessTable.grantedAt));
    res.json(grants.map((grant) => ({ ...grant, grantedAt: grant.grantedAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/access/groups", requireAdmin, async (_req, res) => {
  try {
    const grants = await db.select({
      id: wikiGroupAccessTable.id,
      groupId: wikiGroupAccessTable.groupId,
      groupName: groupsTable.name,
      memberCount: db.$count(groupMembersTable, eq(groupMembersTable.groupId, groupsTable.id)),
      grantedByExternalUserId: wikiGroupAccessTable.grantedByExternalUserId,
      grantedAt: wikiGroupAccessTable.grantedAt,
    }).from(wikiGroupAccessTable)
      .innerJoin(groupsTable, eq(wikiGroupAccessTable.groupId, groupsTable.id))
      .orderBy(asc(groupsTable.name));
    res.json(grants.map((grant) => ({ ...grant, grantedAt: grant.grantedAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/export", requireAdmin, async (req, res) => {
  try {
    const exported = await db.transaction(async (tx) => {
      const [categories, articles, userGrants, groupGrants] = await Promise.all([
      tx.select({
        slug: wikiCategoriesTable.slug,
        name: wikiCategoriesTable.name,
        description: wikiCategoriesTable.description,
        sortOrder: wikiCategoriesTable.sortOrder,
        isActive: wikiCategoriesTable.isActive,
      }).from(wikiCategoriesTable)
        .orderBy(asc(wikiCategoriesTable.sortOrder), asc(wikiCategoriesTable.id)),
      tx.select({
        categorySlug: wikiCategoriesTable.slug,
        slug: wikiArticlesTable.slug,
        title: wikiArticlesTable.title,
        summary: wikiArticlesTable.summary,
        content: wikiArticlesTable.content,
        sortOrder: wikiArticlesTable.sortOrder,
        isActive: wikiArticlesTable.isActive,
      }).from(wikiArticlesTable)
        .innerJoin(wikiCategoriesTable, eq(wikiArticlesTable.categoryId, wikiCategoriesTable.id))
        .orderBy(asc(wikiArticlesTable.sortOrder), asc(wikiArticlesTable.id)),
      tx.select({
        userEmail: usersTable.email,
        grantedAt: wikiAccessTable.grantedAt,
      }).from(wikiAccessTable)
        .innerJoin(usersTable, eq(wikiAccessTable.userId, usersTable.id))
        .orderBy(asc(usersTable.email)),
      tx.select({
        groupName: groupsTable.name,
        grantedAt: wikiGroupAccessTable.grantedAt,
      }).from(wikiGroupAccessTable)
        .innerJoin(groupsTable, eq(wikiGroupAccessTable.groupId, groupsTable.id))
        .orderBy(asc(groupsTable.name)),
      ]);
      const duplicateUserEmails = userGrants
        .map((grant) => grant.userEmail.toLowerCase())
        .filter((email, index, all) => all.indexOf(email) !== index);
      const duplicateGroupNames = groupGrants
        .map((grant) => grant.groupName.toLowerCase())
        .filter((name, index, all) => all.indexOf(name) !== index);
      if (duplicateUserEmails.length || duplicateGroupNames.length) {
        throw new Error("Wiki grants contain ambiguous user emails or group names.");
      }
      return {
        categories,
        articles,
        userGrants: userGrants.map((grant) => ({
          userEmail: grant.userEmail,
          grantedAt: grant.grantedAt.toISOString(),
        })),
        groupGrants: groupGrants.map((grant) => ({
          groupName: grant.groupName,
          grantedAt: grant.grantedAt.toISOString(),
        })),
      } satisfies WikiImportBundle;
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Disposition", `attachment; filename="wiki-content-${date}.json"`);
    res.json(exported);
  } catch (err) {
    req.log.error({ err }, "Wiki export failed");
    res.status(500).json({ error: "Wiki content could not be exported." });
  }
});

router.post("/import/preview", requireAdmin, wikiImportJson, async (req, res) => {
  try {
    const parsed = parseImportBundle(req.body);
    if (!parsed.bundle) {
      res.json({
        categories: { create: 0, update: 0 },
        articles: { create: 0, update: 0 },
        grants: { usersResolved: 0, groupsResolved: 0 },
        unresolvedUserEmails: [],
        unresolvedGroupNames: [],
        errors: parsed.errors,
        canConfirm: false,
      } satisfies WikiImportPreview);
      return;
    }
    res.json(await previewImport(parsed.bundle, parsed.errors));
  } catch (err) {
    req.log.error({ err }, "Wiki import preview failed");
    res.status(500).json({ error: "Wiki import preview could not be generated." });
  }
});

router.post("/import/confirm", requireAdmin, wikiImportJson, async (req, res) => {
  try {
    const parsed = parseImportBundle(req.body);
    if (!parsed.bundle) {
      res.status(400).json({ error: parsed.errors.join(" ") });
      return;
    }
    const preview = await previewImport(parsed.bundle, parsed.errors);
    if (!preview.canConfirm) {
      res.status(400).json({ error: "The import contains errors. Generate a new preview after fixing the file.", preview });
      return;
    }
    const actorExternalUserId = getAuth(req)!.userId!;
    const imported = await db.transaction(async (tx) => {
      for (const category of parsed.bundle!.categories) {
        await tx.insert(wikiCategoriesTable).values({
          ...category,
          createdByExternalUserId: actorExternalUserId,
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: wikiCategoriesTable.slug,
          set: {
            name: category.name,
            description: category.description,
            sortOrder: category.sortOrder,
            isActive: category.isActive,
            updatedAt: new Date(),
          },
        });
      }
      const categoryRows = await tx.select({ id: wikiCategoriesTable.id, slug: wikiCategoriesTable.slug }).from(wikiCategoriesTable);
      const categoryIds = new Map(categoryRows.map((item) => [item.slug, item.id]));
      for (const article of parsed.bundle!.articles) {
        const categoryId = categoryIds.get(article.categorySlug);
        if (!categoryId) throw new Error(`Missing category ${article.categorySlug}`);
        await tx.insert(wikiArticlesTable).values({
          categoryId,
          slug: article.slug,
          title: article.title,
          summary: article.summary,
          content: article.content,
          sortOrder: article.sortOrder,
          isActive: article.isActive,
          createdByExternalUserId: actorExternalUserId,
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: wikiArticlesTable.slug,
          set: {
            categoryId,
            title: article.title,
            summary: article.summary,
            content: article.content,
            sortOrder: article.sortOrder,
            isActive: article.isActive,
            updatedAt: new Date(),
          },
        });
      }
      const [users, groups] = await Promise.all([
        tx.select({ id: usersTable.id, email: usersTable.email }).from(usersTable),
        tx.select({ id: groupsTable.id, name: groupsTable.name }).from(groupsTable),
      ]);
      const usersByEmail = new Map<string, string[]>();
      const groupsByName = new Map<string, number[]>();
      for (const user of users) {
        const email = user.email.toLowerCase();
        usersByEmail.set(email, [...(usersByEmail.get(email) ?? []), user.id]);
      }
      for (const group of groups) {
        const name = group.name.toLowerCase();
        groupsByName.set(name, [...(groupsByName.get(name) ?? []), group.id]);
      }
      let userGrantsImported = 0;
      let groupGrantsImported = 0;
      for (const grant of parsed.bundle!.userGrants) {
        const matchingUserIds = usersByEmail.get(grant.userEmail) ?? [];
        if (matchingUserIds.length === 0) continue;
        if (matchingUserIds.length > 1) throw new Error(`Ambiguous user grant ${grant.userEmail}`);
        const userId = matchingUserIds[0];
        await tx.insert(wikiAccessTable).values({
          userId,
          grantedByExternalUserId: actorExternalUserId,
          grantedAt: new Date(grant.grantedAt),
        }).onConflictDoUpdate({
          target: wikiAccessTable.userId,
          set: { grantedByExternalUserId: actorExternalUserId, grantedAt: new Date(grant.grantedAt) },
        });
        userGrantsImported += 1;
      }
      for (const grant of parsed.bundle!.groupGrants) {
        const matchingGroupIds = groupsByName.get(grant.groupName.toLowerCase()) ?? [];
        if (matchingGroupIds.length === 0) continue;
        if (matchingGroupIds.length > 1) throw new Error(`Ambiguous group grant ${grant.groupName}`);
        const groupId = matchingGroupIds[0];
        await tx.insert(wikiGroupAccessTable).values({
          groupId,
          grantedByExternalUserId: actorExternalUserId,
          grantedAt: new Date(grant.grantedAt),
        }).onConflictDoUpdate({
          target: wikiGroupAccessTable.groupId,
          set: { grantedByExternalUserId: actorExternalUserId, grantedAt: new Date(grant.grantedAt) },
        });
        groupGrantsImported += 1;
      }
      return { userGrantsImported, groupGrantsImported };
    });
    res.json({ ...preview, ...imported });
  } catch (err) {
    req.log.error({ err }, "Wiki import failed");
    res.status(500).json({ error: "Wiki import failed. No changes were committed." });
  }
});

router.put("/access/users/:userId", requireAdmin, async (req, res) => {
  try {
    const userId = String(req.params.userId);
    const enabled = req.body?.enabled;
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }
    const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user[0]) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user[0].role === "admin") {
      res.json({ userId, allowed: true, inherited: true });
      return;
    }
    if (enabled) {
      const auth = getAuth(req);
      const rows = await db.insert(wikiAccessTable)
        .values({ userId, grantedByExternalUserId: auth!.userId! })
        .onConflictDoUpdate({
          target: wikiAccessTable.userId,
          set: { grantedByExternalUserId: auth!.userId!, grantedAt: new Date() },
        }).returning();
      res.json({ ...rows[0], grantedAt: rows[0].grantedAt.toISOString(), allowed: true });
      return;
    }
    await db.delete(wikiAccessTable).where(eq(wikiAccessTable.userId, userId));
    res.json({ userId, allowed: false });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/access/groups/:groupId", requireAdmin, async (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const enabled = req.body?.enabled;
    if (!Number.isInteger(groupId) || groupId < 1 || typeof enabled !== "boolean") {
      res.status(400).json({ error: "Valid group and enabled value are required" });
      return;
    }
    const group = await db.select({ id: groupsTable.id }).from(groupsTable).where(eq(groupsTable.id, groupId)).limit(1);
    if (!group[0]) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (enabled) {
      const auth = getAuth(req);
      const rows = await db.insert(wikiGroupAccessTable)
        .values({ groupId, grantedByExternalUserId: auth!.userId! })
        .onConflictDoUpdate({
          target: wikiGroupAccessTable.groupId,
          set: { grantedByExternalUserId: auth!.userId!, grantedAt: new Date() },
        }).returning();
      res.json({ ...rows[0], grantedAt: rows[0].grantedAt.toISOString(), allowed: true });
      return;
    }
    await db.delete(wikiGroupAccessTable).where(eq(wikiGroupAccessTable.groupId, groupId));
    res.json({ groupId, allowed: false });
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
