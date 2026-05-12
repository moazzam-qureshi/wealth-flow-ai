/**
 * Centralised environment access. Validated lazily on first property access (it's
 * a Proxy), so build-time evaluation doesn't crash. Only the vars needed from day
 * one are required (DATABASE_URL, BETTER_AUTH_SECRET); the rest are optional with
 * sensible defaults — features that depend on them (S3 at Step 5, OpenRouter at
 * Step 4, cron at Step 3) check and fail clearly at the point of use.
 *
 * Server-only — never import from a "use client" module.
 */
import { z } from "zod";

// An empty string in a .env file should be treated as "unset".
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optStr = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const schema = z.object({
  // Required from the start
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),

  // SeaweedFS (S3-compatible) — optional; if unset, src/lib/s3.ts uses a local
  // filesystem fallback (dev). Needed in production.
  SEAWEEDFS_S3_ENDPOINT: optStr,
  SEAWEEDFS_S3_REGION: z.string().default("us-east-1"),
  SEAWEEDFS_S3_ACCESS_KEY: optStr,
  SEAWEEDFS_S3_SECRET_KEY: optStr,
  SEAWEEDFS_BUCKET: z.string().default("screenshots"),

  // OpenRouter (LLM provider) — optional until Mastra is wired (Step 4).
  OPENROUTER_API_KEY: optStr,
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  OPENROUTER_VISION_MODEL: z.string().default("qwen/qwen3-vl-8b-instruct"),
  OPENROUTER_TEXT_MODEL: z.string().default("qwen/qwen3-235b-a22b-2507"),
  OPENROUTER_APP_TITLE: z.string().default("WealthFlow AI"),
  OPENROUTER_APP_URL: z.string().default("https://wealthflow.local"),

  // App
  APP_BASE_URL: z.string().default("http://localhost:3000"),
  BETTER_AUTH_URL: z.string().default("http://localhost:3000"),
  CRON_SECRET: optStr, // bearer token guarding /api/cron/* (Steps 3/6/7)
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),

  // FX rate sources (Step 3)
  FX_INTERBANK_URL: z.string().default("https://open.er-api.com/v6/latest/USD"),
  FX_OPENMARKET_URL: optStr,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

function load(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** `env.X` triggers validation on first property access (not at import). */
export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return load()[prop as keyof Env];
  },
});

/** For features that *require* a var: returns it or throws a clear error. */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const v = env[key];
  if (v === undefined || v === null || v === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return v as NonNullable<Env[K]>;
}
