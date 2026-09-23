import { Router } from "express";
import { requireAdmin } from "../middlewares/requireAuth";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  browseWikiDriveFolders,
  getWikiDriveSyncStatus,
  normalizeDriveFolderId,
  runWikiDriveSync,
  WIKI_DRIVE_SOURCE_SETTING,
} from "../lib/wikiDriveSync";

const router = Router();
router.use(requireAdmin);

router.get("/", async (_req, res) => {
  res.json(await getWikiDriveSyncStatus());
});

router.patch("/", async (req, res) => {
  const sourceFolderId = normalizeDriveFolderId(String(req.body?.sourceFolder ?? req.body?.sourceFolderId ?? ""));
  if (!sourceFolderId) {
    res.status(400).json({ error: "Enter a valid Google Drive folder ID or folder URL" });
    return;
  }
  const existing = await db.select({ id: settingsTable.id }).from(settingsTable).where(eq(settingsTable.key, WIKI_DRIVE_SOURCE_SETTING)).limit(1);
  if (existing[0]) await db.update(settingsTable).set({ value: sourceFolderId }).where(eq(settingsTable.id, existing[0].id));
  else await db.insert(settingsTable).values({ key: WIKI_DRIVE_SOURCE_SETTING, value: sourceFolderId });
  res.json(await getWikiDriveSyncStatus());
});

router.get("/folders", async (req, res) => {
  const rawParentId = String(req.query.parentId ?? "").trim();
  const parentId: string | undefined = rawParentId ? (normalizeDriveFolderId(rawParentId, true) ?? undefined) : undefined;
  if (rawParentId && !parentId) {
    res.status(400).json({ error: "parentId must be a valid Google Drive folder ID" });
    return;
  }
  try {
    res.json({ folders: await browseWikiDriveFolders(parentId), parentId: parentId ?? null });
  } catch (error) {
    req.log.error({ error }, "Drive folder browse failed");
    res.status(502).json({ error: "Google Drive folder browse failed" });
  }
});

router.post("/run", async (req, res) => {
  try {
    const status = await getWikiDriveSyncStatus();
    if (status.status.state === "running") {
      res.status(409).json({ error: "Wiki Drive sync is already running" });
      return;
    }
    void runWikiDriveSync(req.body?.full === true).catch((error) => req.log.error({ error }, "Manual Wiki Drive sync failed"));
    res.status(202).json({ accepted: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to start sync" });
  }
});

export default router;