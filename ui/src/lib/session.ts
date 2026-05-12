/**
 * Server-side session access. Use in server components / route handlers / server
 * actions that need the authenticated user. `requireUser` redirects to /login if
 * there is no valid session (DB-verified, unlike the optimistic check in proxy.ts).
 *
 * Server-only.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";

export async function getCurrentSession() {
  return getAuth().api.getSession({ headers: await headers() });
}

export async function requireUser() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");
  return session.user;
}
