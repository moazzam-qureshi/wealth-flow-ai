/**
 * Helpers for API route handlers: session enforcement, JSON responses, and a
 * thin wrapper that turns thrown errors into clean JSON 4xx/5xx.
 *
 * Server-only.
 */
import { NextResponse } from "next/server";
import { getCurrentSession } from "./session";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** 401s if there's no valid session. */
export async function requireApiUser() {
  const session = await getCurrentSession();
  if (!session?.user) throw new ApiError(401, "Not authenticated");
  return session.user;
}

/**
 * Guards /api/cron/* — these are hit by Coolify scheduled tasks (not the browser),
 * so they're authed by a shared bearer token (CRON_SECRET) instead of a session.
 * If CRON_SECRET is unset (local dev), the check is skipped.
 */
export function requireCron(req: Request) {
  // import lazily to avoid pulling env at module-eval of routes
  const secret = process.env.CRON_SECRET;
  if (!secret) return; // dev convenience
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-cron-secret") ?? "";
  if (token !== secret) throw new ApiError(401, "Bad or missing cron secret");
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** Wrap a handler so ApiError → its status, anything else → 500 (logged). */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error("[api] unhandled error:", err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
