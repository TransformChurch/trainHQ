import { Router, type Response } from "express";
import {
  autoAssignGroupsFromPlanningCenter,
  consumeAuthorizationState,
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  fetchCurrentPerson,
  PlanningCenterError,
  savePlanningCenterTokens,
  upsertPlanningCenterUser,
} from "../lib/planningCenter";
import { issueAppToken } from "../lib/appToken";
import { getAuth } from "../middlewares/auth";
import { getDbUser } from "../middlewares/requireAuth";

const router = Router();

// App tokens last an hour; the site renews them while it's open (POST
// /refresh below), up to this long after the actual Church Center sign-in.
const MAX_SESSION_SECONDS = 12 * 60 * 60;

type TokenUser = {
  externalUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  address?: string | null;
  planningCenterPersonId?: string | null;
};

function appTokenFor(user: TokenUser, authTime?: number): string {
  return issueAppToken({
    sub: user.externalUserId,
    email: user.email,
    given_name: user.firstName,
    family_name: user.lastName,
    ...(authTime ? { auth_time: authTime } : {}),
    ...(user.phone ? { phone_number: user.phone } : {}),
    ...(user.address ? { address: user.address } : {}),
    ...(user.planningCenterPersonId ? { planning_center_person_id: user.planningCenterPersonId } : {}),
  });
}

// The bearer token's (already signature-verified) payload, for auth_time.
function tokenPayload(header: string | undefined): Record<string, unknown> | null {
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function queryValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function redirectWithResult(
  res: Response,
  returnTo: string,
  result: { token: string } | { error: string },
) {
  const separator = returnTo.includes("?") ? "&" : "?";
  if ("token" in result) {
    res.redirect(302, `${returnTo}${separator}auth=success#access_token=${encodeURIComponent(result.token)}`);
    return;
  }
  res.redirect(302, `${returnTo}${separator}auth_error=${encodeURIComponent(result.error)}`);
}

router.get("/planning-center/start", async (req, res) => {
  try {
    const authorizationUrl = await createAuthorizationRequest(req.query.return_to);
    res.redirect(302, authorizationUrl);
  } catch (err) {
    const error = err instanceof PlanningCenterError ? err : null;
    req.log.error({ code: error?.code, err: error ? undefined : err }, "Planning Center OAuth start failed");
    res.status(error?.status ?? 500).json({
      error: error?.message ?? "Unable to start Church Center sign-in.",
      code: error?.code ?? "planning_center_start_failed",
    });
  }
});

router.get("/planning-center/callback", async (req, res) => {
  let returnTo = "/sign-in";
  try {
    const state = queryValue(req.query.state);
    if (!state) {
      throw new PlanningCenterError(
        "invalid_oauth_state",
        "The Church Center sign-in request is invalid.",
        400,
      );
    }
    const authorizationState = await consumeAuthorizationState(state);
    returnTo = authorizationState.returnTo;

    const providerError = queryValue(req.query.error);
    if (providerError) {
      req.log.warn({ providerError }, "Planning Center OAuth permission denied");
      redirectWithResult(res, returnTo, {
        error: providerError === "access_denied"
          ? "planning_center_access_denied"
          : "planning_center_authorization_failed",
      });
      return;
    }

    const code = queryValue(req.query.code);
    if (!code) {
      throw new PlanningCenterError(
        "planning_center_authorization_failed",
        "Planning Center did not return an authorization code.",
        400,
      );
    }

    const tokens = await exchangeAuthorizationCode(code, authorizationState.codeVerifier);
    const person = await fetchCurrentPerson(tokens.accessToken);
    const user = await upsertPlanningCenterUser(person);
    await savePlanningCenterTokens(user.id, tokens);
    try {
      await autoAssignGroupsFromPlanningCenter(user, person.id, tokens.accessToken);
    } catch (groupErr) {
      // Group auto-assignment is best-effort and must never block sign-in.
      req.log.warn({ err: groupErr }, "Planning Center group auto-assignment failed");
    }
    const appToken = appTokenFor(user);
    redirectWithResult(res, returnTo, { token: appToken });
  } catch (err) {
    const error = err instanceof PlanningCenterError ? err : null;
    req.log.error({ code: error?.code, err: error ? undefined : err }, "Planning Center OAuth callback failed");
    redirectWithResult(res, returnTo, {
      error: error?.code ?? "planning_center_callback_failed",
    });
  }
});

// ── POST /api/auth/refresh ──────────────────────────────────────────────────
// Swaps a still-valid token for a fresh one-hour token, so someone working in
// the site (a long report pull, say) isn't silently signed out after an hour.
// Refuses once the original sign-in is older than MAX_SESSION_SECONDS.
router.post("/refresh", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Your sign-in has expired. Sign in again." });
    return;
  }
  const payload = tokenPayload(req.header("authorization"));
  const now = Math.floor(Date.now() / 1000);
  const authTime = typeof payload?.auth_time === "number" ? payload.auth_time
    : typeof payload?.iat === "number" ? payload.iat : now;
  if (now - authTime > MAX_SESSION_SECONDS) {
    res.status(401).json({ error: "Your sign-in is more than 12 hours old. Sign in again." });
    return;
  }
  const user = await getDbUser(auth.userId).catch(() => null);
  if (!user) {
    res.status(401).json({ error: "Your sign-in has expired. Sign in again." });
    return;
  }
  res.json({ token: appTokenFor(user, authTime) });
});

export default router;