// Per-tool access control for the Reporting and Messaging tools.
//
// Admins always have access. For everyone else, an admin chooses (on the
// Tool Management page) which roles get in and, optionally, specific
// individual people. The config is stored as JSON in the existing `settings`
// key/value table (`tool_access:<tool>`), so no database migration is needed.
// Default (no row saved yet) is admin-only, which matches the previous
// behavior of both tools.
import { db, settingsTable, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";

export const TOOL_KEYS = ["reporting", "messaging"] as const;
export type ToolKey = (typeof TOOL_KEYS)[number];

// Roles an admin can grant. "admin" is implicit and never listed.
export const GRANTABLE_ROLES = ["manager", "student"] as const;
export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

export interface ToolAccessConfig {
  roles: GrantableRole[];
  userIds: string[];
}

export function isToolKey(value: unknown): value is ToolKey {
  return typeof value === "string" && (TOOL_KEYS as readonly string[]).includes(value);
}

function settingKey(tool: ToolKey) {
  return `tool_access:${tool}`;
}

export function normalizeToolAccessConfig(raw: unknown): ToolAccessConfig {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const roles = Array.isArray(obj.roles)
    ? [...new Set(obj.roles.filter((r): r is GrantableRole => (GRANTABLE_ROLES as readonly string[]).includes(r as string)))]
    : [];
  const userIds = Array.isArray(obj.userIds)
    ? [...new Set(obj.userIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200))]
    : [];
  return { roles, userIds };
}

export function userHasToolAccess(user: Pick<User, "id" | "role">, config: ToolAccessConfig): boolean {
  if (user.role === "admin") return true;
  if (config.roles.includes(user.role as GrantableRole)) return true;
  return config.userIds.includes(user.id);
}

export async function getToolAccessConfig(tool: ToolKey): Promise<ToolAccessConfig> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, settingKey(tool))).limit(1);
  if (!rows[0]) return { roles: [], userIds: [] };
  try {
    return normalizeToolAccessConfig(JSON.parse(rows[0].value));
  } catch {
    // A corrupt value fails closed to admin-only.
    return { roles: [], userIds: [] };
  }
}

export async function setToolAccessConfig(tool: ToolKey, config: ToolAccessConfig): Promise<ToolAccessConfig> {
  const clean = normalizeToolAccessConfig(config);
  const value = JSON.stringify(clean);
  const key = settingKey(tool);
  const existing = await db.select({ id: settingsTable.id }).from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  if (existing[0]) await db.update(settingsTable).set({ value }).where(eq(settingsTable.id, existing[0].id));
  else await db.insert(settingsTable).values({ key, value });
  return clean;
}

export async function canUserAccessTool(user: Pick<User, "id" | "role">, tool: ToolKey): Promise<boolean> {
  if (user.role === "admin") return true;
  return userHasToolAccess(user, await getToolAccessConfig(tool));
}

export async function listUsersForAccessPicker() {
  const users = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      role: usersTable.role,
    })
    .from(usersTable)
    .orderBy(usersTable.lastName, usersTable.firstName);
  return users;
}
