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
  } catch (err) {
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

    const existing = await getDbUser(clerkId);
    if (existing) {
      const updated = await db
        .update(usersTable)
        .set({ firstName, lastName, email, phone: phone ?? null })
        .where(eq(usersTable.clerkId, clerkId))
        .returning();
      const u = updated[0];
      res.json({ id: u.id, clerkId: u.clerkId, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, role: u.role, createdAt: u.createdAt.toISOString() });
    } else {
      const id = clerkId;
      const inserted = await db
        .insert(usersTable)
        .values({ id, clerkId, firstName, lastName, email, phone: phone ?? null, role: "student" })
        .returning();
      const u = inserted[0];
      res.json({ id: u.id, clerkId: u.clerkId, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, role: u.role, createdAt: u.createdAt.toISOString() });
    }
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
