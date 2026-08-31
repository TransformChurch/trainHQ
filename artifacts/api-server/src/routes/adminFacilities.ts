import { Router } from "express";
import {
  db,
  facilitiesAccessTable,
  facilitiesCategoriesTable,
  facilitiesRequestsTable,
  usersTable,
} from "@workspace/db";
import { asc, eq, inArray } from "drizzle-orm";
import { getAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAuth";

const router = Router();

const ICONS = new Set([
  "wrench",
  "alert-triangle",
  "building",
  "truck",
  "coffee",
  "megaphone",
  "monitor",
  "headphones",
  "clipboard",
]);

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function integer(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function externalUrl(value: unknown) {
  const candidate = text(value, 2000);
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

async function listCategories() {
  const categories = await db
    .select()
    .from(facilitiesCategoriesTable)
    .orderBy(asc(facilitiesCategoriesTable.sortOrder), asc(facilitiesCategoriesTable.id));
  const categoryIds = categories.map((category) => category.id);
  const requests = categoryIds.length
    ? await db
        .select()
        .from(facilitiesRequestsTable)
        .where(inArray(facilitiesRequestsTable.categoryId, categoryIds))
        .orderBy(asc(facilitiesRequestsTable.sortOrder), asc(facilitiesRequestsTable.id))
    : [];
  return categories.map((category) => ({
    ...category,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    requests: requests
      .filter((request) => request.categoryId === category.id)
      .map((request) => ({
        ...request,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
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
    const grants = await db
      .select()
      .from(facilitiesAccessTable)
      .orderBy(asc(facilitiesAccessTable.grantedAt));
    res.json(grants.map((grant) => ({ ...grant, grantedAt: grant.grantedAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/access/:userId", requireAdmin, async (req, res) => {
  try {
    const userId = req.params.userId as string;
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
      const rows = await db
        .insert(facilitiesAccessTable)
        .values({ userId, grantedByExternalUserId: auth!.userId! })
        .onConflictDoUpdate({
          target: facilitiesAccessTable.userId,
          set: { grantedByExternalUserId: auth!.userId!, grantedAt: new Date() },
        })
        .returning();
      res.json({ ...rows[0], grantedAt: rows[0].grantedAt.toISOString(), allowed: true });
      return;
    }
    await db.delete(facilitiesAccessTable).where(eq(facilitiesAccessTable.userId, userId));
    res.json({ userId, allowed: false });
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
    const rows = await db.insert(facilitiesCategoriesTable).values({
      name,
      description: text(req.body?.description, 500) || null,
      sortOrder: integer(req.body?.sortOrder),
      isActive: req.body?.isActive !== false,
      createdByExternalUserId: getAuth(req)!.userId!,
    }).returning();
    res.status(201).json(rows[0]);
  } catch (err) {
    if (String(err).includes("facilities_categories_name_unique")) {
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
    const values: Partial<typeof facilitiesCategoriesTable.$inferInsert> = { updatedAt: new Date() };
    if ("name" in req.body) {
      const name = text(req.body.name, 120);
      if (!name) {
        res.status(400).json({ error: "Category name is required" });
        return;
      }
      values.name = name;
    }
    if ("description" in req.body) values.description = text(req.body.description, 500) || null;
    if ("sortOrder" in req.body) values.sortOrder = integer(req.body.sortOrder);
    if ("isActive" in req.body && typeof req.body.isActive === "boolean") values.isActive = req.body.isActive;
    const rows = await db
      .update(facilitiesCategoriesTable)
      .set(values)
      .where(eq(facilitiesCategoriesTable.id, categoryId))
      .returning();
    if (!rows[0]) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    if (String(err).includes("facilities_categories_name_unique")) {
      res.status(409).json({ error: "A category with this name already exists" });
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
    await db.delete(facilitiesCategoriesTable).where(eq(facilitiesCategoriesTable.id, categoryId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/requests", requireAdmin, async (req, res) => {
  try {
    const categoryId = integer(req.body?.categoryId, -1);
    const title = text(req.body?.title, 160);
    const description = text(req.body?.description, 1000);
    const url = externalUrl(req.body?.url);
    if (categoryId < 1 || !title || !description || !url) {
      res.status(400).json({ error: "Category, title, description, and a valid link are required" });
      return;
    }
    const category = await db
      .select({ id: facilitiesCategoriesTable.id })
      .from(facilitiesCategoriesTable)
      .where(eq(facilitiesCategoriesTable.id, categoryId))
      .limit(1);
    if (!category[0]) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    const requestedIcon = text(req.body?.icon, 40);
    const rows = await db.insert(facilitiesRequestsTable).values({
      categoryId,
      eyebrow: text(req.body?.eyebrow, 100) || null,
      title,
      description,
      useWhen: text(req.body?.useWhen, 1000) || null,
      url,
      buttonLabel: text(req.body?.buttonLabel, 80) || "Open form →",
      icon: ICONS.has(requestedIcon) ? requestedIcon : "clipboard",
      sortOrder: integer(req.body?.sortOrder),
      isActive: req.body?.isActive !== false,
      createdByExternalUserId: getAuth(req)!.userId!,
    }).returning();
    res.status(201).json(rows[0]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/requests/:requestId", requireAdmin, async (req, res) => {
  try {
    const requestId = Number(req.params.requestId);
    if (!Number.isInteger(requestId)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const values: Partial<typeof facilitiesRequestsTable.$inferInsert> = { updatedAt: new Date() };
    if ("categoryId" in req.body) {
      const categoryId = integer(req.body.categoryId, -1);
      if (categoryId < 1) {
        res.status(400).json({ error: "A valid category is required" });
        return;
      }
      values.categoryId = categoryId;
    }
    if ("title" in req.body) {
      const title = text(req.body.title, 160);
      if (!title) {
        res.status(400).json({ error: "Title is required" });
        return;
      }
      values.title = title;
    }
    if ("description" in req.body) {
      const description = text(req.body.description, 1000);
      if (!description) {
        res.status(400).json({ error: "Description is required" });
        return;
      }
      values.description = description;
    }
    if ("url" in req.body) {
      const url = externalUrl(req.body.url);
      if (!url) {
        res.status(400).json({ error: "A valid http or https link is required" });
        return;
      }
      values.url = url;
    }
    if ("eyebrow" in req.body) values.eyebrow = text(req.body.eyebrow, 100) || null;
    if ("useWhen" in req.body) values.useWhen = text(req.body.useWhen, 1000) || null;
    if ("buttonLabel" in req.body) values.buttonLabel = text(req.body.buttonLabel, 80) || "Open form →";
    if ("icon" in req.body) {
      const icon = text(req.body.icon, 40);
      if (!ICONS.has(icon)) {
        res.status(400).json({ error: "Invalid icon" });
        return;
      }
      values.icon = icon;
    }
    if ("sortOrder" in req.body) values.sortOrder = integer(req.body.sortOrder);
    if ("isActive" in req.body && typeof req.body.isActive === "boolean") values.isActive = req.body.isActive;
    const rows = await db
      .update(facilitiesRequestsTable)
      .set(values)
      .where(eq(facilitiesRequestsTable.id, requestId))
      .returning();
    if (!rows[0]) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/requests/:requestId", requireAdmin, async (req, res) => {
  try {
    const requestId = Number(req.params.requestId);
    if (!Number.isInteger(requestId)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    await db.delete(facilitiesRequestsTable).where(eq(facilitiesRequestsTable.id, requestId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;