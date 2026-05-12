/**
 * Better Auth — multi-user email+password. Signup is open: anyone can create an
 * account and gets their own isolated data (everything is scoped by `owner_id` →
 * `user.id`). No email verification (there's no email provider wired up here yet).
 * The Drizzle adapter keeps the user/session/account/verification tables in our
 * normal migration set.
 *
 * Built lazily via `getAuth()` so `next build` doesn't evaluate it (and doesn't
 * need BETTER_AUTH_SECRET / DATABASE_URL at build time). Consumers call `getAuth()`
 * — do NOT export a wrapped/proxied instance: `toNextJsHandler` does
 * `"handler" in auth ? ...` and other identity-sensitive checks.
 *
 * Server-only.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from "../db/schema";
import { env } from "./env";

let _auth: ReturnType<typeof build> | null = null;

function build() {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      // signup is open — multi-user; each new account is fully isolated by owner_id.
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL, env.APP_BASE_URL],
  });
}

export function getAuth() {
  if (!_auth) _auth = build();
  return _auth;
}
