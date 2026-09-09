import { Router } from "express";
import { requireManagerOrAdmin } from "../middlewares/requireAuth";
import {
  PlanningCenterError,
  getValidPlanningCenterAccessToken,
  listPlanningCenterFieldDefinitions,
} from "../lib/planningCenter";

const router = Router();

// GET /admin/planning-center/field-definitions — list this admin's live Planning Center
// "People" custom fields, for building a field picker (e.g. the Track PCO date-field
// dropdowns in the Edit Track dialog). Uses the requesting manager/admin's own connected
// Church Center account, same as the existing Reports "fields" endpoint.
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
