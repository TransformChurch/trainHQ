import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// --- Lazy initialization -----------------------------------------------
// This module used to throw at IMPORT time if DATABASE_URL wasn't set.
// That broke every test file that imports a sibling module for its pure,
// non-database logic (e.g. planningCenter.ts's buildFieldDatumUpdate) --
// importing that module transitively imports this one, which threw before
// a single test body ever ran, regardless of whether the test touched the
// database. See AUDIT_LOG.md Phase 0/5 (finding 2.6).
//
// Fix: defer both the env check and the actual Pool/drizzle construction
// until the first real use of `pool`/`db`, via a Proxy. Behavior for the
// running app is unchanged -- the same "DATABASE_URL must be set" error is
// still thrown, with the same message, the first time any route actually
// touches the database (which in practice is immediately, since nearly
// every route does) -- it just no longer fires merely from importing a
// file that happens to import this one.
let realPool: pg.Pool | undefined;

function createPool(): pg.Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  const newPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Supabase's Nano-tier pooler fronts a pool of 15 real Postgres backend
    // connections, shared across every route in this app (there's only one
    // container instance -- wrangler.toml: max_instances = 1). 10 leaves
    // headroom for other concurrent work (report generation, the PDF indexer)
    // without this app alone being able to exhaust the pooler's own limit.
    max: 10,
    // Previously unset, which means node-postgres's default: a client that
    // can't get a connection because the pool is full waits *forever*, with
    // no error, until one frees up. Observed effect of that: a dashboard
    // request logged at ~0ms CPU time but 1.54 *minutes* of wall time before
    // its eventual 500 -- all of that time was spent queued for a connection,
    // not computing. Failing fast here turns pool contention into a quick,
    // clear, catchable error instead of a multi-minute hang.
    connectionTimeoutMillis: 10_000,
  });

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
  newPool.on("error", (err) => {
    console.error("Postgres pool idle client error (connection recycled, continuing):", err);
  });

  return newPool;
}

function getPool(): pg.Pool {
  if (!realPool) realPool = createPool();
  return realPool;
}

function lazyProxy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop, _receiver) {
      const real = resolve();
      const value = Reflect.get(real as object, prop, real);
      return typeof value === "function" ? value.bind(real) : value;
    },
    has(_target, prop) {
      return Reflect.has(resolve() as object, prop);
    },
  });
}

export const pool: pg.Pool = lazyProxy(getPool);

let realDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getDb() {
  if (!realDb) realDb = drizzle(getPool(), { schema });
  return realDb;
}

export const db: ReturnType<typeof drizzle<typeof schema>> = lazyProxy(getDb);

export * from "./schema";
