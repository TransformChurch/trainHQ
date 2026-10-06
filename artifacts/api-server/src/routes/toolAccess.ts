import { Router, type IRouter } from "express";
import { getAuth } from "../middlewares/auth";
import { getDbUser, requireAdmin } from "../middlewares/requireAuth";
import {
  TOOL_KEYS,
  canUserAccessTool,
  getToolAccessConfig,
  isToolKey,
  listUsersForAccessPicker,
  normalizeToolAccessConfig,
  setToolAccessConfig,
} from "../lib/toolAccess";

const router: IRouter = Router();

// GET /api/tool-access/me -- which gated tools the signed-in user can open.
// Used by the sidebar and route guards; the real enforcement is the
// requireToolAccess middleware on each tool's API routes.
router.get("/me", async (req, res) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const user = await getDbUser(auth.userId);
    const result: Record<string, boolean> = {};
    for (const tool of TOOL_KEYS) result[tool] = user ? await canUserAccessTool(user, tool) : false;
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "tool access lookup failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/tool-access -- admin: every tool's config plus the people
// list for the "specific individuals" picker.
export const adminToolAccessRouter: IRouter = Router();

adminToolAccessRouter.get("/", requireAdmin, async (req, res) => {
  try {
    const tools: Record<string, Awaited<ReturnType<typeof getToolAccessConfig>>> = {};
    for (const tool of TOOL_KEYS) tools[tool] = await getToolAccessConfig(tool);
    res.json({ tools, users: await listUsersForAccessPicker() });
  } catch (err) {
    req.log.error({ err }, "tool access config load failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

adminToolAccessRouter.put("/:tool", requireAdmin, async (req, res) => {
  const tool = req.params.tool;
  if (!isToolKey(tool)) {
    res.status(404).json({ error: "Unknown tool" });
    return;
  }
  try {
    const saved = await setToolAccessConfig(tool, normalizeToolAccessConfig(req.body));
    req.log.info({ tool, roles: saved.roles, userCount: saved.userIds.length, by: res.locals.dbUser.id }, "tool access updated");
    res.json(saved);
  } catch (err) {
    req.log.error({ err }, "tool access save failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
