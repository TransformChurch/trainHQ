import { Router } from "express";
import { getAuth } from "../middlewares/auth";
import {
  db,
  documentsTable,
  documentAccessTable,
  modulesTable,
  groupsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, inArray, sql, isNull } from "drizzle-orm";
import { requireManagerOrAdmin } from "../middlewares/requireAuth";
import { canEditContent } from "../lib/canEditContent";

const router = Router();

// ── GET /api/admin/documents — tree structure ─────────────────────────────────

router.get("/", requireManagerOrAdmin, async (req, res) => {
  try {
    const docs = await db
      .select()
      .from(documentsTable)
      .orderBy(documentsTable.sortOrder, documentsTable.createdAt);

    const counts = await db
      .select({
        documentId: documentAccessTable.documentId,
        count: sql<number>`count(*)::int`,
      })
      .from(documentAccessTable)
      .groupBy(documentAccessTable.documentId);

    const countMap = new Map(counts.map(c => [c.documentId, c.count]));

    const serialize = (d: typeof documentsTable.$inferSelect) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      accessCount: countMap.get(d.id) ?? 0,
    });

    const folders = docs.filter(d => d.resourceType === "folder");
    const fileDocs = docs.filter(d => d.resourceType === "file");

    const tree = {
      folders: folders.map(f => ({
        ...serialize(f),
        documents: fileDocs
          .filter(d => d.parentId === f.id)
          .map(serialize),
      })),
      unfiled: fileDocs.filter(d => d.parentId === null).map(serialize),
    };

    res.json(tree);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/admin/documents/import-folder ──────────────────────────────────
// Bulk-imports all files from a publicly-shared Google Drive folder.
// Requires GOOGLE_API_KEY secret (Drive API v3 read-only key).
// Each imported file is created as a private document (no access grants).

router.post("/import-folder", requireManagerOrAdmin, async (req, res) => {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "GOOGLE_API_KEY is not configured. Set it in the server environment to enable Drive folder import." });
    return;
  }

  try {
    const auth = getAuth(req);
    const { folderUrl, parentId } = req.body as { folderUrl?: string; parentId?: number | null };

    if (!folderUrl || !folderUrl.trim()) {
      res.status(400).json({ error: "folderUrl is required" });
      return;
    }

    // Extract folder ID from various Drive folder URL formats:
    // https://drive.google.com/drive/folders/FOLDER_ID
    // https://drive.google.com/drive/u/0/folders/FOLDER_ID?usp=sharing
    const folderIdMatch = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (!folderIdMatch) {
      res.status(400).json({ error: "Could not extract a folder ID from the URL. Make sure it is a Google Drive folder link." });
      return;
    }
    const folderId = folderIdMatch[1];

    // Drive API v3: list all files whose parent is this folder.
    // supportsAllDrives + includeItemsFromAllDrives are required for Shared/Team Drives.
    const driveUrl = new URL("https://www.googleapis.com/drive/v3/files");
    driveUrl.searchParams.set("q", `'${folderId}' in parents and trashed = false`);
    driveUrl.searchParams.set("fields", "files(id,name,mimeType,webViewLink)");
    driveUrl.searchParams.set("pageSize", "200");
    driveUrl.searchParams.set("supportsAllDrives", "true");
    driveUrl.searchParams.set("includeItemsFromAllDrives", "true");
    driveUrl.searchParams.set("key", apiKey);

    const driveRes = await fetch(driveUrl.toString());

    if (!driveRes.ok) {
      const errBody = await driveRes.text();
      console.error(`Drive API error (${driveRes.status}):`, errBody);
      if (driveRes.status === 403) {
        res.status(400).json({
          error: "Google Drive returned 'forbidden'. Possible causes: (1) The folder is not shared with 'Anyone with the link'; (2) The Google API key has HTTP referrer or IP restrictions blocking server calls; (3) The Drive API is not enabled for this API key's project.",
        });
        return;
      }
      if (driveRes.status === 404) {
        res.status(400).json({ error: "Folder not found. Double-check the URL." });
        return;
      }
      res.status(502).json({ error: `Google Drive API returned ${driveRes.status}. Check the server logs for details.` });
      return;
    }

    const driveData = (await driveRes.json()) as { files?: { id: string; name: string; mimeType: string; webViewLink: string }[] };
    const files = (driveData.files ?? []).filter(f => f.mimeType !== "application/vnd.google-apps.folder");

    if (files.length === 0) {
      res.json({ imported: 0, message: "No files found in that folder (subfolders are not imported)." });
      return;
    }

    const toInsert = files.map(f => ({
      title: f.name,
      description: null as string | null,
      driveUrl: f.webViewLink,
      resourceType: "file" as const,
      parentId: parentId ?? null,
      createdByExternalUserId: auth!.userId!,
    }));

    const inserted = await db.insert(documentsTable).values(toInsert).returning();

    res.status(201).json({ imported: inserted.length, documents: inserted.map(d => ({ ...d, createdAt: d.createdAt.toISOString(), accessCount: 0 })) });
  } catch (err) {
    console.error("import-folder error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/admin/documents ─────────────────────────────────────────────────

router.post("/", requireManagerOrAdmin, async (req, res) => {
  try {
    const auth = getAuth(req);
    const { title, description, driveUrl, resourceType, parentId } = req.body as {
      title?: string;
      description?: string | null;
      driveUrl?: string | null;
      resourceType?: "file" | "folder";
      parentId?: number | null;
    };
    if (!title || !title.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const type: "file" | "folder" = resourceType ?? (driveUrl?.includes("/file/d/") ? "file" : driveUrl ? "folder" : "folder");
    const inserted = await db.insert(documentsTable).values({
      title: title.trim(),
      description: description ?? null,
      driveUrl: driveUrl?.trim() || null,
      resourceType: type,
      parentId: parentId ?? null,
      createdByExternalUserId: auth!.userId!,
    }).returning();
    res.status(201).json({ ...inserted[0], createdAt: inserted[0].createdAt.toISOString(), accessCount: 0 });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/admin/documents/:id ───────────────────────────────────────────

router.patch("/:id", requireManagerOrAdmin, async (req, res) => {
  try {
    const actor = res.locals.dbUser;
    const id = parseInt(req.params.id as string);

    const existing = await db.select().from(documentsTable).where(eq(documentsTable.id, id)).limit(1);
    if (!existing[0]) { res.status(404).json({ error: "Not found" }); return; }
    if (!(await canEditContent(actor, "document", id, existing[0].createdByExternalUserId))) {
      res.status(403).json({ error: "You don't have permission to edit this document." });
      return;
    }

    const { title, description, driveUrl, parentId, sortOrder } = req.body as {
      title?: string;
      description?: string | null;
      driveUrl?: string | null;
      parentId?: number | null;
      sortOrder?: number;
    };
    const updates: Record<string, unknown> = {};
    if (title !== undefined && title.trim()) updates.title = title.trim();
    if (description !== undefined) updates.description = description ?? null;
    if (driveUrl !== undefined) updates.driveUrl = driveUrl?.trim() || null;
    if (parentId !== undefined) updates.parentId = parentId ?? null;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    const updated = await db.update(documentsTable).set(updates).where(eq(documentsTable.id, id)).returning();
    if (!updated[0]) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...updated[0], createdAt: updated[0].createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/admin/documents/:id ──────────────────────────────────────────
// DB cascade handles children (via self-FK) and access grants (via FK to documentsTable.id)

router.delete("/:id", requireManagerOrAdmin, async (req, res) => {
  try {
    const actor = res.locals.dbUser;
    const id = parseInt(req.params.id as string);

    const existing = await db.select().from(documentsTable).where(eq(documentsTable.id, id)).limit(1);
    if (!existing[0]) { res.status(404).json({ error: "Not found" }); return; }
    if (!(await canEditContent(actor, "document", id, existing[0].createdByExternalUserId))) {
      res.status(403).json({ error: "You don't have permission to delete this document." });
      return;
    }

    const linkedModule = await db
      .select({ title: modulesTable.title })
      .from(modulesTable)
      .where(eq(modulesTable.documentId, id))
      .limit(1);
    if (linkedModule[0]) {
      res.status(409).json({
        error: `This document is used by the training module "${linkedModule[0].title}". Change that module before deleting the document.`,
      });
      return;
    }

    await db.delete(documentsTable).where(eq(documentsTable.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/admin/documents/:id/access ──────────────────────────────────────

router.get("/:id/access", requireManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const grants = await db
      .select()
      .from(documentAccessTable)
      .where(eq(documentAccessTable.documentId, id))
      .orderBy(documentAccessTable.grantedAt);

    const groupIds = grants.filter(g => g.principalType === "group").map(g => parseInt(g.principalId));
    const userIds = grants.filter(g => g.principalType === "user").map(g => g.principalId);

    const groups = groupIds.length > 0
      ? await db.select({ id: groupsTable.id, name: groupsTable.name }).from(groupsTable).where(inArray(groupsTable.id, groupIds))
      : [];
    const users = userIds.length > 0
      ? await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, userIds))
      : [];

    const groupNameMap = new Map(groups.map(g => [g.id, g.name]));
    const userNameMap = new Map(users.map(u => [u.id, { name: `${u.firstName} ${u.lastName}`.trim() || u.email, email: u.email }]));

    res.json(grants.map(g => ({
      ...g,
      grantedAt: g.grantedAt.toISOString(),
      displayName: g.principalType === "group"
        ? (groupNameMap.get(parseInt(g.principalId)) ?? `Group ${g.principalId}`)
        : (userNameMap.get(g.principalId)?.name ?? g.principalId),
      email: g.principalType === "user" ? (userNameMap.get(g.principalId)?.email ?? null) : null,
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/admin/documents/:id/access ─────────────────────────────────────

router.post("/:id/access", requireManagerOrAdmin, async (req, res) => {
  try {
    const auth = getAuth(req);
    const id = parseInt(req.params.id as string);
    const { principalType, principalId } = req.body as { principalType?: string; principalId?: string };
    if (!principalType || !principalId) {
      res.status(400).json({ error: "principalType and principalId are required" });
      return;
    }
    if (principalType !== "group" && principalType !== "user") {
      res.status(400).json({ error: "principalType must be 'group' or 'user'" });
      return;
    }
    const existing = await db
      .select()
      .from(documentAccessTable)
      .where(and(
        eq(documentAccessTable.documentId, id),
        eq(documentAccessTable.principalType, principalType as "group" | "user"),
        eq(documentAccessTable.principalId, principalId),
      ))
      .limit(1);
    if (existing[0]) { res.status(409).json({ error: "Access already granted" }); return; }

    const inserted = await db.insert(documentAccessTable).values({
      documentId: id,
      principalType: principalType as "group" | "user",
      principalId,
      grantedByExternalUserId: auth!.userId!,
    }).returning();
    res.status(201).json({ ...inserted[0], grantedAt: inserted[0].grantedAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/admin/documents/:id/access/:accessId ─────────────────────────

router.delete("/:id/access/:accessId", requireManagerOrAdmin, async (req, res) => {
  try {
    const accessId = parseInt(req.params.accessId as string);
    await db.delete(documentAccessTable).where(eq(documentAccessTable.id, accessId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
