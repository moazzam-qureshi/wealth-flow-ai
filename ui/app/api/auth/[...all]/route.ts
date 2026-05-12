import { getAuth } from "@/src/lib/auth";

// Catch-all Better Auth endpoint. The instance is built lazily on first request
// (not at module-eval / build time). Equivalent to `toNextJsHandler(auth)` but
// avoids needing the singleton at build time.
function authHandler(req: Request) {
  return getAuth().handler(req);
}

export const GET = authHandler;
export const POST = authHandler;
