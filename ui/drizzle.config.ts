import { defineConfig } from "drizzle-kit";

// Manages only the app tables in src/db/schema.ts.
// Mastra's mastra_* tables are created/migrated by @mastra/pg at runtime — not here.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
