import { Router } from "express";
import { getAuth } from "../middlewares/auth";
import { db, usersTable, groupMembersTable, groupDriveResourcesTable, groupsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth, getDbUser } from "../middlewares/requireAuth";
import { UpsertMeBody } from "@workspace/api-zod";

const router = Router();

// GET /users/me
router.get("/me", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const user = await getDbUser(auth!.userId!);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      id: user.id,
      externalUserId: user.externalUserId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      address: user.address,
      planningCenterPersonId: user.planningCenterPersonId,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /users/me - upsert user on first sign-in
router.put("/me", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const parsed = UpsertMeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const { firstName, lastName, email, phone } = parsed.data;
    const externalUserId = auth!.userId!;
    const configuredAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
    const configuredAdminExternalUserId = process.env.INITIAL_ADMIN_EXTERNAL_USER_ID?.trim();

    const serializeUser = (u: typeof usersTable.$inferSelect) => ({
      id: u.id, externalUserId: u.externalUserId, firstName: u.firstName, lastName: u.lastName,
      email: u.email, phone: u.phone, role: u.role, createdAt: u.createdAt.toISOString(),
      address: u.address, planningCenterPersonId: u.planningCenterPersonId,
    });

    // 1. Found by external identity — normal update
    const existingByExternalUserId = await getDbUser(externalUserId);
    if (existingByExternalUserId) {
      if (existingByExternalUserId.planningCenterPersonId) {
        res.json(serializeUser(existingByExternalUserId));
        return;
      }
      const updated = await db
        .update(usersTable)
        .set({ firstName, lastName, email, phone: phone ?? null })
        .where(eq(usersTable.externalUserId, externalUserId))
        .returning();
      res.json(serializeUser(updated[0]));
      return;
    }

    // 2. Not found by external identity — check by email.
    //    This handles users whose authentication subject changed. Re-link the account in place so
    //    their role and history are preserved.
    const byEmail = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (byEmail[0]) {
      if (byEmail[0].planningCenterPersonId) {
        res.json(serializeUser(byEmail[0]));
        return;
      }
      const updated = await db
        .update(usersTable)
        .set({
          externalUserId,
          firstName: firstName || byEmail[0].firstName,
          lastName: lastName || byEmail[0].lastName,
          phone: phone ?? byEmail[0].phone,
        })
        .where(eq(usersTable.email, email))
        .returning();
      res.json(serializeUser(updated[0]));
      return;
    }

    // 3. Brand-new user — insert. An operator can bootstrap exactly one admin
    // by configuring a trusted external identity before the first sign-in.
    const hasConfiguredAdminIdentity =
      (configuredAdminEmail !== undefined && email.trim().toLowerCase() === configuredAdminEmail) ||
      (configuredAdminExternalUserId !== undefined && externalUserId === configuredAdminExternalUserId);
    const existingAdmin = hasConfiguredAdminIdentity
      ? await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin")).limit(1)
      : [];
    const role = hasConfiguredAdminIdentity && existingAdmin.length === 0 ? "admin" : "student";
    const inserted = await db
      .insert(usersTable)
      .values({ id: externalUserId, externalUserId, firstName, lastName, email, phone: phone ?? null, role })
      .returning();
    res.json(serializeUser(inserted[0]));
  } catch (err) {
    req.log.error({ err }, "Error upserting user");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /users/me - update profile fields
router.patch("/me", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const externalUserId = auth!.userId!;
    const existing = await getDbUser(externalUserId);
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (existing.planningCenterPersonId) {
      res.status(403).json({
        error: "Planning Center profile information can only be updated through Church Center.",
      });
      return;
    }
    const { firstName, lastName, phone } = req.body as { firstName?: string; lastName?: string; phone?: string | null };
    const updates: Partial<{ firstName: string; lastName: string; phone: string | null }> = {};
    if (firstName !== undefined && typeof firstName === "string" && firstName.trim()) updates.firstName = firstName.trim();
    if (lastName !== undefined && typeof lastName === "string" && lastName.trim()) updates.lastName = lastName.trim();
    if (phone !== undefined) updates.phone = phone || null;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const updated = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.externalUserId, externalUserId))
      .returning();

    if (!updated[0]) return;
    const u = updated[0];
    res.json({
      id: u.id,
      externalUserId: u.externalUserId,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phone: u.phone,
      address: u.address,
      planningCenterPersonId: u.planningCenterPersonId,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /users/me/drive-resources — all Drive resources for groups the user belongs to
router.get("/me/drive-resources", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const user = await getDbUser(auth!.userId!);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const memberships = await db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.userId, user.id));

    if (memberships.length === 0) {
      res.json([]);
      return;
    }

    const groupIds = memberships.map(m => m.groupId);

    const groups = await db
      .select({ id: groupsTable.id, name: groupsTable.name })
      .from(groupsTable)
      .where(inArray(groupsTable.id, groupIds));

    const groupNameMap = new Map(groups.map(g => [g.id, g.name]));

    const resources = await db
      .select()
      .from(groupDriveResourcesTable)
      .where(inArray(groupDriveResourcesTable.groupId, groupIds))
      .orderBy(groupDriveResourcesTable.groupId, groupDriveResourcesTable.sortOrder, groupDriveResourcesTable.createdAt);

    res.json(resources.map(r => ({
      ...r,
      groupName: groupNameMap.get(r.groupId) ?? "",
      createdAt: r.createdAt.toISOString(),
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
