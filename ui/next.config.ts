import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone build for the Docker image (copies only needed files; no node_modules in the image).
  output: "standalone",

  // IA changed in the UX rework — keep old paths working.
  async redirects() {
    return [
      { source: "/upload", destination: "/", permanent: false },
      { source: "/accounts", destination: "/money/accounts", permanent: false },
      { source: "/suggestions", destination: "/ideas", permanent: false },
    ];
  },

  // Mastra (and its transitive deps like pg/libsql) must run as native Node modules,
  // not be bundled by Turbopack/webpack into the server output.
  serverExternalPackages: [
    "@mastra/core",
    "@mastra/memory",
    "@mastra/pg",
    "@mastra/ai-sdk",
    "@mastra/loggers",
    "pg",
    "postgres",
    "@libsql/client",
    "rss-parser",
  ],

  // The standalone build traces files imported by the app. scripts/migrate.mjs is
  // run outside Next (by the Docker entrypoint), so explicitly include the bits of
  // drizzle-orm/postgres it needs in the traced node_modules.
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/drizzle-orm/package.json",
      "node_modules/drizzle-orm/postgres-js/**/*",
      "node_modules/drizzle-orm/migrator*",
      "node_modules/postgres/package.json",
      "node_modules/postgres/**/*",
    ],
  },
};

export default nextConfig;
