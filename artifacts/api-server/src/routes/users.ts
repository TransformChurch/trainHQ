import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
      clerkId: user.clerkId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
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
    const clerkId = auth!.userId!;

    const serializeUser = (u: typeof usersTable.$inferSelect) => ({
      id: u.id, clerkId: u.clerkId, firstName: u.firstName, lastName: u.lastName,
      email: u.email, phone: u.phone, role: u.role, createdAt: u.createdAt.toISOString(),
    });

    // 1. Found by clerkId — normal update
    const existingByClerkId = await getDbUser(clerkId);
    if (existingByClerkId) {
      const updated = await db
        .update(usersTable)
        .set({ firstName, lastName, email, phone: phone ?? null })
        .where(eq(usersTable.clerkId, clerkId))
        .returning();
      res.json(serializeUser(updated[0]));
      return;
    }

    // 2. Not found by clerkId — check by email.
    //    This handles users whose Clerk ID changed (e.g. dev→prod migration,
    //    or linking a second sign-in method). Re-link the account in place so
    //    their role and history are preserved.
    const byEmail = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (byEmail[0]) {
      const updated = await db
        .update(usersTable)
        .set({
          clerkId,
          firstName: firstName || byEmail[0].firstName,
          lastName: lastName || byEmail[0].lastName,
          phone: phone ?? byEmail[0].phone,
        })
        .where(eq(usersTable.email, email))
        .returning();
      res.json(serializeUser(updated[0]));
      return;
    }

    // 3. Brand-new user — insert
    const inserted = await db
      .insert(usersTable)
      .values({ id: clerkId, clerkId, firstName, lastName, email, phone: phone ?? null, role: "student" })
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
    const clerkId = auth!.userId!;
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
      .where(eq(usersTable.clerkId, clerkId))
      .returning();

    if (!updated[0]) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const u = updated[0];
    res.json({ id: u.id, clerkId: u.clerkId, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, role: u.role, createdAt: u.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
