import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { like } from "drizzle-orm";

const router = Router();

router.get("/site-copy", async (_req, res) => {
  try {
    const rows = await db
      .select({ key: settingsTable.key, value: settingsTable.value })
      .from(settingsTable)
      .where(like(settingsTable.key, "copy.%"));

    res.json(Object.fromEntries(rows.map((row) => [row.key.slice("copy.".length), row.value])));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;