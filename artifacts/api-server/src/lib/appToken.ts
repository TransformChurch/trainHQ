import { createHmac } from "node:crypto";

type AppTokenClaims = {
  sub: string;
  email: string;
  given_name: string;
  family_name: string;
  phone_number?: string;
  // When the person actually signed in with Church Center (unix seconds).
  // Carried unchanged through token refreshes so a session can't be renewed
  // forever -- see MAX_SESSION_SECONDS in routes/planningCenterAuth.ts.
  auth_time?: number;
};

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function issueAppToken(claims: AppTokenClaims, lifetimeSeconds = 60 * 60): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error("AUTH_JWT_SECRET is required to issue application tokens");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    ...claims,
    auth_time: claims.auth_time ?? now,
    iat: now,
    exp: now + lifetimeSeconds,
  });
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}