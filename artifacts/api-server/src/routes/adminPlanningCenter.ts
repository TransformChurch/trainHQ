import { Router } from "express";
import { requireManagerOrAdmin } from "../middlewares/requireAuth";
import {
  PlanningCenterError,
  getValidPlanningCenterAccessToken,
  listPlanningCenterFieldDefinitions,
} from "../lib/planningCenter";

const router = Router();

router.get("/field-definitions", requireManagerOrAdmin, async (req, res) => {
  try {
    const accessToken = await getValidPlanningCenterAccessToken(res.locals.dbUser.id);
    const fields = await listPlanningCenterFieldDefinitions(accessToken);
    res.json({ fields });
  } catch (err) {
    if (err instanceof PlanningCenterError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    req.log.error({ err }, "Failed to list Planning Center field definitions");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;