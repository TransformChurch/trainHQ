import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";

export type Auth = { userId: string | null };

const authByRequest = new WeakMap<Request, Auth>();

function decodeBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}

function verifyToken(token: string): Auth {
  const secret = process.env.AUTH_JWT_SECRET;
  const parts = token.split(".");
  if (!secret || parts.length !== 3) return { userId: null };

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const headerBuffer = decodeBase64Url(encodedHeader);
  const payloadBuffer = decodeBase64Url(encodedPayload);
  const signature = decodeBase64Url(encodedSignature);
  if (!headerBuffer || !payloadBuffer || !signature) return { userId: null };

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(headerBuffer.toString("utf8"));
    payload = JSON.parse(payloadBuffer.toString("utf8"));
  } catch {
    return { userId: null };
  }
  if (
    !header ||
    typeof header !== "object" ||
    (header as { alg?: unknown }).alg !== "HS256" ||
    !payload ||
    typeof payload !== "object"
  ) {
    return { userId: null };
  }

  const expected = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    return { userId: null };
  }

  const claims = payload as { sub?: unknown; exp?: unknown; nbf?: unknown };
  const now = Math.floor(Date.now() / 1000);
  if (
    typeof claims.sub !== "string" ||
    claims.sub.trim() === "" ||
    typeof claims.exp !== "number" ||
    !Number.isFinite(claims.exp) ||
    now >= claims.exp ||
    (claims.nbf !== undefined &&
      (typeof claims.nbf !== "number" ||
        !Number.isFinite(claims.nbf) ||
        now < claims.nbf))
  ) {
    return { userId: null };
  }
  return { userId: claims.sub };
}

export const authMiddleware: RequestHandler = (req, _res, next) => {
  const authorization = req.header("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  authByRequest.set(req, match ? verifyToken(match[1]) : { userId: null });
  next();
};

/** Returns the verified bearer-token identity associated with a request. */
export function getAuth(req: Request): Auth {
  return authByRequest.get(req) ?? { userId: null };
}