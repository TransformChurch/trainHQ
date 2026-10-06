import type { NextFunction, Request, Response } from "express";
import { getAuth } from "./auth";
import { getDbUser } from "./requireAuth";
import { canUserAccessTool, type ToolKey } from "../lib/toolAccess";

// Lets admins plus whoever an admin granted this tool to (by role or by
// person -- see lib/toolAccess.ts). Sets res.locals.dbUser like requireAdmin.
export function requireToolAccess(tool: ToolKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = getAuth(req);
    if (!auth?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const user = await getDbUser(auth.userId);
      if (!user || !(await canUserAccessTool(user, tool))) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      res.locals.dbUser = user;
      next();
    } catch (err) {
      req.log?.error({ err }, "tool access check failed");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
