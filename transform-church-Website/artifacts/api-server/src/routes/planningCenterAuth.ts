import { Router, type Response } from "express";
import {
  consumeAuthorizationState,
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  fetchCurrentPerson,
  PlanningCenterError,
  savePlanningCenterTokens,
  upsertPlanningCenterUser,
} from "../lib/planningCenter";
import { issueAppToken } from "../lib/appToken";

const router = Router();

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
    const appToken = issueAppToken({
      sub: user.externalUserId,
      email: user.email,
      given_name: user.firstName,
      family_name: user.lastName,
      ...(user.phone ? { phone_number: user.phone } : {}),
      ...(user.address ? { address: user.address } : {}),
      ...(user.planningCenterPersonId ? { planning_center_person_id: user.planningCenterPersonId } : {}),
    });
    redirectWithResult(res, returnTo, { token: appToken });
  } catch (err) {
    const error = err instanceof PlanningCenterError ? err : null;
    req.log.error({ code: error?.code, err: error ? undefined : err }, "Planning Center OAuth callback failed");
    redirectWithResult(res, returnTo, {
      error: error?.code ?? "planning_center_callback_failed",
    });
  }
});

export default router;