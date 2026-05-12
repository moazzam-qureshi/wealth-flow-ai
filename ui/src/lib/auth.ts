/**
 * Better Auth — single-user email+password. No email verification (there's no
 * email provider here and it's just one account). The Drizzle adapter keeps the
 * user/session/account/verification tables in our normal migration set.
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
      // signup stays open — there's no /signup UI; you create the single account
      // once from /login, then the proxy gate keeps everyone else out.
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
