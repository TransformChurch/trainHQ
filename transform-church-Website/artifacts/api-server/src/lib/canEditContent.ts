import { db, contentEditorGrantsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

type DbUser = { role: string; externalUserId: string };

/**
 * Returns true if the given user may mutate (PATCH/DELETE) the specified content item.
 * - Admins always can.
 * - Managers can if they created it OR have been explicitly granted editor access by an admin.
 */
export async function canEditContent(
  dbUser: DbUser,
  contentType: "track" | "module" | "video" | "document",
  contentId: number,
  createdByExternalUserId: string | null | undefined,
): Promise<boolean> {
  if (dbUser.role === "admin") return true;
  if (createdByExternalUserId && createdByExternalUserId === dbUser.externalUserId) return true;
  const grant = await db
    .select({ id: contentEditorGrantsTable.id })
    .from(contentEditorGrantsTable)
    .where(and(
      eq(contentEditorGrantsTable.contentType, contentType),
      eq(contentEditorGrantsTable.contentId, contentId),
      eq(contentEditorGrantsTable.granteeExternalUserId, dbUser.externalUserId),
    ))
    .limit(1);
  return grant.length > 0;
}
