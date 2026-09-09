import { Router } from "express";
import {
  db,
  facilitiesAccessTable,
  facilitiesGroupAccessTable,
  facilitiesCategoryAccessTable,
  facilitiesCategoryGroupAccessTable,
  facilitiesCategoriesTable,
  facilitiesRequestsTable,
  groupMembersTable,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getAuth } from "../middlewares/auth";
import { getDbUser, requireAuth } from "../middlewares/requireAuth";

const router = Router();

async function canAccessFacilities(user: { id: string; role: string }) {
  if (user.role === "admin") return true;
  const rows = await db
    .select({ id: facilitiesAccessTable.id })
    .from(facilitiesAccessTable)
    .where(eq(facilitiesAccessTable.userId, user.id))
    .limit(1);
  if (rows.length > 0) return true;

  const groupRows = await db
    .select({ id: facilitiesGroupAccessTable.id })
    .from(groupMembersTable)
    .innerJoin(
      facilitiesGroupAccessTable,
      eq(groupMembersTable.groupId, facilitiesGroupAccessTable.groupId),
    )
    .where(eq(groupMembersTable.userId, user.id))
    .limit(1);
  return groupRows.length > 0;
}

async function accessibleCategoryIds(user: { id: string; role: string }) {
  if (user.role === "admin" || await canAccessFacilities(user)) return null;

  const [userGrants, groupGrants] = await Promise.all([
    db
      .select({ categoryId: facilitiesCategoryAccessTable.categoryId })
      .from(facilitiesCategoryAccessTable)
      .where(eq(facilitiesCategoryAccessTable.userId, user.id)),
    db
      .select({ categoryId: facilitiesCategoryGroupAccessTable.categoryId })
      .from(groupMembersTable)
      .innerJoin(
        facilitiesCategoryGroupAccessTable,
        eq(groupMembersTable.groupId, facilitiesCategoryGroupAccessTable.groupId),
      )
      .where(eq(groupMembersTable.userId, user.id)),
  ]);

  return new Set([...userGrants, ...groupGrants].map((grant) => grant.categoryId));
}

async function currentUser(req: Parameters<typeof getAuth>[0]) {
  const auth = getAuth(req);
  return auth?.userId ? getDbUser(auth.userId) : null;
}

router.get("/access", requireAuth, async (req, res) => {
  try {
    const user = await currentUser(req);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const categoryIds = await accessibleCategoryIds(user);
    res.json({ allowed: categoryIds === null || categoryIds.size > 0 });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const user = await currentUser(req);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const allowedCategoryIds = await accessibleCategoryIds(user);
    if (allowedCategoryIds !== null && allowedCategoryIds.size === 0) {
      res.status(403).json({ error: "You do not have access to the Request Hub." });
      return;
    }

    const allCategories = await db
      .select()
      .from(facilitiesCategoriesTable)
      .where(eq(facilitiesCategoriesTable.isActive, true))
      .orderBy(asc(facilitiesCategoriesTable.sortOrder), asc(facilitiesCategoriesTable.id));
    const categories = allowedCategoryIds === null
      ? allCategories
      : allCategories.filter((category) => allowedCategoryIds.has(category.id));
    const categoryIds = categories.map((category) => category.id);
    const requests = categoryIds.length
      ? await db
          .select()
          .from(facilitiesRequestsTable)
          .where(inArray(facilitiesRequestsTable.categoryId, categoryIds))
          .orderBy(asc(facilitiesRequestsTable.sortOrder), asc(facilitiesRequestsTable.id))
      : [];
    const activeRequests = requests.filter((request) => request.isActive);

    res.json(categories.map((category) => ({
      ...category,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
      requests: activeRequests
        .filter((request) => request.categoryId === category.id)
        .map((request) => ({
          ...request,
          createdAt: request.createdAt.toISOString(),
          updatedAt: request.updatedAt.toISOString(),
        })),
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;