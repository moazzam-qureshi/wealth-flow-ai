/**
 * Standalone migration runner (plain ESM — no TS loader needed in the prod image).
 * Invoked by the Docker entrypoint before the server starts; also runnable locally
 * with `node scripts/migrate.mjs` (needs DATABASE_URL).
 *
 * Reads SQL migrations from ui/src/db/migrations via drizzle-orm's bundled migrator.
 * Mastra creates its own mastra_* tables at runtime — not handled here.
 */
// Runs with Node's native ESM resolver, outside the bundler. The Docker image
// overlays the full drizzle-orm/postgres packages (with their "exports" maps) so
// these package-subpath imports resolve correctly. See ui/Dockerfile.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, "..", "src", "db", "migrations");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  console.log(`[migrate] applying migrations from ${migrationsFolder}`);
  await migrate(drizzle(sql), { migrationsFolder });
  console.log("[migrate] done");
} catch (err) {
  console.error("[migrate] failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
