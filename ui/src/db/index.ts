/**
 * Drizzle client. One shared `postgres` connection pool per process, created
 * lazily on first use so `next build` (which evaluates route modules without
 * runtime env) doesn't try to connect or read DATABASE_URL too early.
 *
 * In Next.js dev, module state can be re-evaluated on hot reload — cache on
 * globalThis so we don't leak pools.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "../lib/env";

const globalForDb = globalThis as unknown as {
  __wealthflowSql?: ReturnType<typeof postgres>;
  __wealthflowDb?: ReturnType<typeof drizzle<typeof schema>>;
};

function getDb() {
  if (globalForDb.__wealthflowDb) return globalForDb.__wealthflowDb;
  const sql = globalForDb.__wealthflowSql ?? postgres(env.DATABASE_URL, { max: 10 });
  const instance = drizzle(sql, { schema });
  globalForDb.__wealthflowSql = sql;
  globalForDb.__wealthflowDb = instance;
  return instance;
}

// `db` is a lazy proxy: any property access initializes the real client on first
// use. Lets `import { db }` stay ergonomic everywhere without eager connection.
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
export type Db = ReturnType<typeof drizzle<typeof schema>>;
