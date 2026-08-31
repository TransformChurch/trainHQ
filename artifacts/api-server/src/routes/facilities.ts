import { Router } from "express";
import {
  db,
  facilitiesAccessTable,
  facilitiesCategoriesTable,
  facilitiesRequestsTable,
} from "@workspace/db";
import { asc, eq, inArray } from "drizzle-orm";
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
  return rows.length > 0;
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
    res.json({ allowed: await canAccessFacilities(user) });
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
    if (!(await canAccessFacilities(user))) {
      res.status(403).json({ error: "You do not have access to Facilities." });
      return;
    }

    const categories = await db
      .select()
      .from(facilitiesCategoriesTable)
      .where(eq(facilitiesCategoriesTable.isActive, true))
      .orderBy(asc(facilitiesCategoriesTable.sortOrder), asc(facilitiesCategoriesTable.id));
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