// Cloudflare Worker entry point for the Transform Church API.
//
// This Worker is deliberately thin: it forwards every incoming request to
// the containerized Node/Express app (see ./Dockerfile and
// artifacts/api-server). The one piece of real logic here is the
// `outboundByHost` handler below -- containers do not get direct access to
// Workers bindings like R2, so the container's `objectStorage.ts` (in
// "r2" mode) makes plain HTTP requests to the virtual host
// "objects.internal", and this handler is what actually resolves those
// requests against the real R2 bucket binding.
//
// See: https://developers.cloudflare.com/containers/configuration/workers-connections/
import { Container, ContainerProxy, getContainer } from "@cloudflare/containers";

// Required by Cloudflare: outbound interception (this Worker's
// `outboundByHost` handler below, which bridges the container's
// object-storage calls to R2) only works if `ContainerProxy` is exported
// from the Worker entrypoint. See:
// https://developers.cloudflare.com/containers/configuration/outbound-traffic/
export { ContainerProxy };
import { env as ambientEnv } from "cloudflare:workers";

export interface Env {
  API_CONTAINER: DurableObjectNamespace<TransformChurchContainer>;
  STORAGE_BUCKET: R2Bucket;
  NODE_ENV: string;
  PCO_REDIRECT_URI: string;
  LOG_LEVEL?: string;
  CORS_ALLOWED_ORIGINS?: string;
  CORS_ALLOW_CREDENTIALS?: string;
  FRAME_ANCESTORS?: string;
  PUBLIC_API_URL?: string;
  // Secrets -- set with `wrangler secret put <NAME>`, never committed here.
  DATABASE_URL: string;
  AUTH_JWT_SECRET: string;
  SESSION_SECRET: string;
  STORAGE_SIGNING_SECRET: string;
  PCO_CLIENT_ID?: string;
  PCO_CLIENT_SECRET?: string;
  PCO_MODULE_FIELD_DEFINITION_MAP?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  GOOGLE_API_KEY?: string;
  // Bootstrap-only -- set until the first admin signs in, then unset.
  INITIAL_ADMIN_EMAIL?: string;
  INITIAL_ADMIN_EXTERNAL_USER_ID?: string;
}

// `cloudflare:workers`'s `env` export is typed against the ambient `Env`
// interface that `wrangler types` generates into worker-configuration.d.ts
// from your wrangler.toml bindings. That file doesn't exist until someone
// runs `wrangler types` once against a real account, so we cast here
// rather than depend on it -- at runtime this is still the real bound env
// object with every var/secret below present.
const env = ambientEnv as unknown as Env;

export class TransformChurchContainer extends Container<Env> {
  defaultPort = 3000;
  // Scale-to-zero after 10 minutes idle, matching the Workers Paid Containers
  // allowance model (you only pay while it's actually running).
  sleepAfter = "10m";

  // Class-field envVars must be synchronous, so only plain vars/secrets go
  // here (per Cloudflare's docs) -- KV/Secret Store values would need the
  // async startAndWaitForPorts() path instead, which this app doesn't need.
  envVars = {
    NODE_ENV: env.NODE_ENV,
    PORT: "3000",
    LOG_LEVEL: env.LOG_LEVEL ?? "info",
    STORAGE_BACKEND: "r2",
    STORAGE_R2_HOST: "objects.internal",
    DATABASE_URL: env.DATABASE_URL,
    AUTH_JWT_SECRET: env.AUTH_JWT_SECRET,
    SESSION_SECRET: env.SESSION_SECRET,
    STORAGE_SIGNING_SECRET: env.STORAGE_SIGNING_SECRET,
    PCO_CLIENT_ID: env.PCO_CLIENT_ID ?? "",
    PCO_CLIENT_SECRET: env.PCO_CLIENT_SECRET ?? "",
    PCO_REDIRECT_URI: env.PCO_REDIRECT_URI,
    PCO_MODULE_FIELD_DEFINITION_MAP: env.PCO_MODULE_FIELD_DEFINITION_MAP ?? "",
    RESEND_API_KEY: env.RESEND_API_KEY ?? "",
    EMAIL_FROM: env.EMAIL_FROM ?? "",
    GOOGLE_API_KEY: env.GOOGLE_API_KEY ?? "",
    // CORS defaults match the app's own safe-by-default behavior: blank
    // origins means same-origin only, credentials off, framing self-only.
    CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS ?? "",
    CORS_ALLOW_CREDENTIALS: env.CORS_ALLOW_CREDENTIALS ?? "false",
    FRAME_ANCESTORS: env.FRAME_ANCESTORS ?? "'self'",
    PUBLIC_API_URL: env.PUBLIC_API_URL ?? "",
    // Bootstrap-only: set these as Worker secrets for the first deploy, then
    // remove them (via `wrangler secret delete` or the dashboard) once the
    // first administrator has signed in.
    INITIAL_ADMIN_EMAIL: env.INITIAL_ADMIN_EMAIL ?? "",
    INITIAL_ADMIN_EXTERNAL_USER_ID: env.INITIAL_ADMIN_EXTERNAL_USER_ID ?? "",
  };

  // Bridges the container's plain-HTTP object-storage calls to the real R2
  // binding. Mirrors the read/write surface objectStorage.ts needs: HEAD
  // (existence + metadata), GET (download), PUT (upload, with content-type
  // and custom metadata carried in headers), DELETE.
  static outboundByHost = {
    "objects.internal": async (request: Request, env: Env): Promise<Response> => {
      const url = new URL(request.url);
      const key = decodeURIComponent(url.pathname.slice(1));
      if (!key) return new Response("Missing object key", { status: 400 });

      if (request.method === "HEAD" || request.method === "GET") {
        const object = await env.STORAGE_BUCKET.get(key);
        if (!object) return new Response(null, { status: 404 });
        const headers = new Headers();
        if (object.httpMetadata?.contentType) headers.set("content-type", object.httpMetadata.contentType);
        headers.set("content-length", String(object.size));
        headers.set("etag", object.httpEtag);
        headers.set("x-object-custom-metadata", JSON.stringify(object.customMetadata ?? {}));
        return new Response(request.method === "HEAD" ? null : object.body, { headers });
      }

      if (request.method === "PUT") {
        const contentType = request.headers.get("content-type") ?? undefined;
        const customMetadataHeader = request.headers.get("x-object-custom-metadata");
        let customMetadata: Record<string, string> | undefined;
        if (customMetadataHeader) {
          try { customMetadata = JSON.parse(customMetadataHeader); } catch { customMetadata = undefined; }
        }
        await env.STORAGE_BUCKET.put(key, request.body, {
          httpMetadata: contentType ? { contentType } : undefined,
          customMetadata,
        });
        return new Response(null, { status: 204 });
      }

      if (request.method === "DELETE") {
        await env.STORAGE_BUCKET.delete(key);
        return new Response(null, { status: 204 });
      }

      return new Response("Method not allowed", { status: 405 });
    },
  };
}

export default {
  async fetch(request: Request, workerEnv: Env): Promise<Response> {
    // Single named instance for now -- this app is stateless (JWT auth, no
    // in-memory session state) so this is purely a "one running copy"
    // choice, not a correctness requirement. Bump max_instances in
    // wrangler.toml and route with getRandom() instead if traffic grows
    // enough to want more than one container running concurrently.
    return getContainer(workerEnv.API_CONTAINER, "primary").fetch(request);
  },
};
