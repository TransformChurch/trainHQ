import { createHmac } from "node:crypto";

type AppTokenClaims = {
  sub: string;
  email: string;
  given_name: string;
  family_name: string;
  phone_number?: string;
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
    iat: now,
    exp: now + lifetimeSeconds,
  });
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}