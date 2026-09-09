import type { LocalObjectFile } from "./objectStorage";

export enum ObjectAccessGroupType {}
export interface ObjectAccessGroup { type: ObjectAccessGroupType; id: string; }
export enum ObjectPermission { READ = "read", WRITE = "write" }
export interface ObjectAclRule { group: ObjectAccessGroup; permission: ObjectPermission; }
export interface ObjectAclPolicy { owner: string; visibility: "public" | "private"; aclRules?: Array<ObjectAclRule>; }

function isPermissionAllowed(requested: ObjectPermission, granted: ObjectPermission): boolean {
  return requested === ObjectPermission.READ
    ? [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted)
    : granted === ObjectPermission.WRITE;
}
abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(public readonly type: ObjectAccessGroupType, public readonly id: string) {}
  public abstract hasMember(userId: string): Promise<boolean>;
}
function createObjectAccessGroup(group: ObjectAccessGroup): BaseObjectAccessGroup {
  throw new Error(`Unknown access group type: ${group.type}`);
}
export async function setObjectAclPolicy(objectFile: LocalObjectFile, aclPolicy: ObjectAclPolicy): Promise<void> {
  const { ObjectStorageService } = await import("./objectStorage");
  const storage = new ObjectStorageService();
  const metadata = await storage.readMetadata(objectFile);
  await storage.writeMetadata(objectFile, { ...metadata, aclPolicy });
}
export async function getObjectAclPolicy(objectFile: LocalObjectFile): Promise<ObjectAclPolicy | null> {
  const { ObjectStorageService } = await import("./objectStorage");
  return (await new ObjectStorageService().readMetadata(objectFile)).aclPolicy || null;
}
export async function canAccessObject({ userId, objectFile, requestedPermission }: {
  userId?: string; objectFile: LocalObjectFile; requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const policy = await getObjectAclPolicy(objectFile);
  if (!policy) return false;
  if (policy.visibility === "public" && requestedPermission === ObjectPermission.READ) return true;
  if (!userId) return false;
  if (policy.owner === userId) return true;
  for (const rule of policy.aclRules || []) {
    if ((await createObjectAccessGroup(rule.group).hasMember(userId)) && isPermissionAllowed(requestedPermission, rule.permission)) return true;
  }
  return false;
}