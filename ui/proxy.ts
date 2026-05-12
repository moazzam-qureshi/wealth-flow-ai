/**
 * Next.js 16 "proxy" (formerly middleware). Single-user gate: if there's no Better
 * Auth session cookie, redirect to /login. This is an *optimistic* check (cookie
 * presence only, no DB hit) per Better Auth's guidance — route handlers / server
 * components still verify the session for anything sensitive.
 *
 * Excluded from the gate (see `matcher`): /login, all of /api/* (route handlers do
 * their own auth — `requireApiUser` returns 401 JSON, not a redirect), and Next's
 * static assets. So this only redirects *page* requests.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    // remember where they were headed
    loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // page requests only — exclude /login, all /api/*, Next internals, manifest & icons
    "/((?!login|api/|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|sw.js).*)",
  ],
};
