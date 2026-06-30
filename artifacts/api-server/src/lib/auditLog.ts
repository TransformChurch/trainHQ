import { db, contentAuditLogTable, tracksTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function logContentChange(params: {
  actorId: string;
  actorName: string;
  action: "create" | "update" | "delete";
  entityType: "track" | "module" | "video";
  entityId: number;
  entityName: string;
  trackId?: number | null;
}) {
  try {
    let trackName: string | null = null;
    if (params.trackId) {
      const rows = await db
        .select({ name: tracksTable.name })
        .from(tracksTable)
        .where(eq(tracksTable.id, params.trackId))
        .limit(1);
      trackName = rows[0]?.name ?? null;
    }
    await db.insert(contentAuditLogTable).values({
      actorId: params.actorId,
      actorName: params.actorName,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      entityName: params.entityName,
      trackId: params.trackId ?? null,
      trackName,
    });
  } catch (err) {
    console.error("Failed to log content change:", err);
  }
}
