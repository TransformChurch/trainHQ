import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// node-postgres emits "error" on the Pool itself whenever an *idle* client
// (one not currently running a query) gets disconnected by the server --
// e.g. Supabase's pooler recycling a connection after its own idle timeout.
// That's a normal, expected event, not a bug, but EventEmitter's default
// behavior for an "error" event with no listener is to throw, which crashes
// the whole Node process (and, on Cloudflare Containers, kills the
// container -- every route then fails with "Container suddenly
// disconnected" until it restarts). Logging here instead of letting that
// happen was the fix for the 2026-09-30/10-01 crash-loop: see
// website-hosting-deployment.md in the project docs.
pool.on("error", (err) => {
  console.error("Postgres pool idle client error (connection recycled, continuing):", err);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
