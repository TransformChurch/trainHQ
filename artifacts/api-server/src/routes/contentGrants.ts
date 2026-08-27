import { Router } from "express";
import { getAuth } from "../middlewares/auth";
import { db, contentEditorGrantsTable, usersTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { requireAdmin, requireManagerOrAdmin } from "../middlewares/requireAuth";

const router = Router();

// ── GET /api/admin/content-grants/mine ────────────────────────────────────────
// Returns the IDs of all content items the current manager has been explicitly
// granted edit access to. Admins get back empty sets (they can edit everything).

router.get("/mine", requireManagerOrAdmin, async (req, res) => {
  const dbUser = res.locals.dbUser;
  if (dbUser.role === "admin") {
    res.json({ tracks: [], modules: [], videos: [], documents: [] });
    return;
  }
  try {
    const grants = await db
      .select({ contentType: contentEditorGrantsTable.contentType, contentId: contentEditorGrantsTable.contentId })
      .from(contentEditorGrantsTable)
      .where(eq(contentEditorGrantsTable.granteeExternalUserId, dbUser.externalUserId));

    const result: Record<string, number[]> = { tracks: [], modules: [], videos: [], documents: [] };
    for (const g of grants) {
      const key = g.contentType + "s"; // "track" -> "tracks"
      if (result[key]) result[key].push(g.contentId);
    }
    res.json(result);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/admin/content-grants ─────────────────────────────────────────────
// List editor grants for a specific content item (admin only).
// Query params: contentType, contentId

router.get("/", requireAdmin, async (req, res) => {
  const { contentType, contentId } = req.query as { contentType?: string; contentId?: string };
  if (!contentType || !contentId) {
    res.status(400).json({ error: "contentType and contentId are required" });
    return;
  }
  try {
    const grants = await db
      .select()
      .from(contentEditorGrantsTable)
      .where(and(
        eq(contentEditorGrantsTable.contentType, contentType),
        eq(contentEditorGrantsTable.contentId, parseInt(contentId)),
      ));

    // Enrich with user names
    const externalUserIds = grants.map(g => g.granteeExternalUserId);
    const users = externalUserIds.length > 0
      ? await db.select({ externalUserId: usersTable.externalUserId, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
          .from(usersTable)
          .where(inArray(usersTable.externalUserId, externalUserIds))
      : [];
    const userMap = new Map(users.map(u => [u.externalUserId, u]));

    res.json(grants.map(g => ({
      ...g,
      grantedAt: g.grantedAt.toISOString(),
      grantee: userMap.get(g.granteeExternalUserId) ?? null,
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/admin/content-grants ────────────────────────────────────────────
// Grant a manager edit access to a content item (admin only).

router.post("/", requireAdmin, async (req, res) => {
  const auth = getAuth(req);
  const { contentType, contentId, granteeExternalUserId } = req.body as {
    contentType?: string;
    contentId?: number;
    granteeExternalUserId?: string;
  };
  if (!contentType || !contentId || !granteeExternalUserId) {
    res.status(400).json({ error: "contentType, contentId, and granteeExternalUserId are required" });
    return;
  }
  if (!["track", "module", "video", "document"].includes(contentType)) {
    res.status(400).json({ error: "contentType must be track, module, video, or document" });
    return;
  }
  try {
    const inserted = await db
      .insert(contentEditorGrantsTable)
      .values({ contentType, contentId, granteeExternalUserId, grantedByExternalUserId: auth!.userId! })
      .onConflictDoNothing()
      .returning();
    res.status(201).json({ ...inserted[0], grantedAt: inserted[0]?.grantedAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/admin/content-grants/:id ──────────────────────────────────────
// Revoke an editor grant (admin only).

router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  try {
    await db.delete(contentEditorGrantsTable).where(eq(contentEditorGrantsTable.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
