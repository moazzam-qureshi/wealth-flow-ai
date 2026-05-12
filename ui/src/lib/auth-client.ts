/**
 * Better Auth browser client. Used by the /login page (sign in / sign up / sign out).
 * Same-origin, so baseURL can be relative.
 */
"use client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
