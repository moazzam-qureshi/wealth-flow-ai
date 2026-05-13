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

// Cron jobs run in-process via the scheduler (see src/lib/scheduler.ts), so the
// /api/cron/* HTTP routes exist only for *manual* re-runs (debugging, "run it
// now"). They use the normal session auth (`requireApiUser`) — a logged-in user's
// cookie is enough; no shared bearer secret. Random internet hits get a 401.

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
