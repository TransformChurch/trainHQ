// Google Drive access for the Wiki Drive sync, authenticated as a Google
// Cloud service account rather than through a logged-in user's own Google
// account. A service account fits this feature well: the sync is a
// background job with no "signed-in admin" context of its own (it can run
// from a Cloudflare Cron Trigger with nobody logged in), and once the staff
// Drive folder is shared with the service account's email address, the
// token obtained here never needs a person to re-authorize anything --
// unlike an OAuth authorization-code flow's refresh token, which is tied to
// whichever admin connected it.
//
// Replaces the previous @replit/connectors-sdk-based implementation, which
// hard-required a REPL_IDENTITY environment variable only ever present
// inside Replit's own execution environment -- confirmed by reading the
// installed SDK's source directly (its identity.js throws "REPL_IDENTITY is
// not set in the environment" otherwise, with no way to supply that value
// from outside Replit's infrastructure). That made the entire Wiki Drive
// sync feature non-functional once this app moved to running as a
// Cloudflare Worker + Container (see wrangler.toml / src/worker.ts), which
// has no such variable and no access to Replit's connector proxy at all.
//
// No Google client library is used here, consistent with this codebase's
// existing style for third-party HTTP integrations (see lib/sms.ts and
// lib/email.ts -- both hand-rolled fetch calls rather than an SDK): this is
// a standard RFC 7523 JWT-bearer token exchange, built with Node's built-in
// `crypto`.
import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
// Refresh this many seconds before the token's real expiry, so a token
// already handed to an in-flight request is never valid-when-fetched but
// expired-by-the-time-it's-used.
const EXPIRY_SAFETY_MARGIN_SECONDS = 60;

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
};

// `undefined` = not checked yet; `null` = checked and missing/invalid. This
// means a missing key fails fast on every call (same as before) without
// re-parsing JSON every time, and without treating "not configured" as a
// transient error worth retrying.
let cachedKey: ServiceAccountKey | null | undefined;
let cachedToken: { accessToken: string; expiresAt: number } | null = null;
let pendingTokenRequest: Promise<string> | null = null;

function loadServiceAccountKey(): ServiceAccountKey | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    cachedKey = null;
    return cachedKey;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccountKey>;
    cachedKey = parsed.client_email && parsed.private_key
      ? { client_email: parsed.client_email, private_key: parsed.private_key }
      : null;
  } catch {
    cachedKey = null;
  }
  return cachedKey;
}

export function isGoogleDriveConfigured(): boolean {
  return loadServiceAccountKey() !== null;
}

function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input)).toString("base64url");
}

async function requestAccessToken(): Promise<string> {
  const key = loadServiceAccountKey();
  if (!key) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY is not configured. Set it (the full Google Cloud service-account JSON key, on one line) in the server environment, and share the Wiki's Drive folder with that service account's email address, to enable the Wiki Drive sync.",
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = base64url(JSON.stringify({
    iss: key.client_email,
    scope: DRIVE_READONLY_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claimSet}`;
  const signature = base64url(createSign("RSA-SHA256").update(signingInput).sign(key.private_key));
  const assertion = `${signingInput}.${signature}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google OAuth token request failed (${response.status}): ${body.slice(0, 500)}`);
  }
  const body = await response.json() as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Google OAuth token response did not include an access_token");
  cachedToken = {
    accessToken: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600) - EXPIRY_SAFETY_MARGIN_SECONDS,
  };
  return cachedToken.accessToken;
}

// De-duplicates concurrent token requests once the cached token has expired
// -- mirrors the pendingRefreshes pattern already used for Planning Center
// token refreshes in lib/planningCenter.ts (getValidPlanningCenterAccessToken),
// fixed earlier in this project's audit for the same reason: without it,
// several Drive calls firing at once (e.g. listing multiple subfolders in
// parallel) right after expiry would each kick off their own redundant
// token exchange.
export async function getGoogleDriveAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.accessToken;
  if (!pendingTokenRequest) {
    pendingTokenRequest = requestAccessToken().finally(() => {
      pendingTokenRequest = null;
    });
  }
  return pendingTokenRequest;
}
