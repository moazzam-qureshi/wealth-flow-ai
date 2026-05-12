/**
 * Shared Mastra instance — runs IN-PROCESS inside the Next.js app (no separate
 * server). Holds storage + logger; agents are built per-request (see
 * `createChatAgent(ownerId)`), not registered here, because they're owner-scoped.
 * Built lazily via `getMastra()` so `next build` doesn't evaluate it (and doesn't
 * need OPENROUTER_API_KEY / DATABASE_URL at build time).
 *
 * Storage shares the app's Postgres (Mastra creates its own `mastra_*` tables at
 * runtime — not part of our Drizzle migrations).
 *
 * Server-only.
 */
import { Mastra } from "@mastra/core/mastra";
import { PostgresStore } from "@mastra/pg";
import { PinoLogger } from "@mastra/loggers";
import { env } from "../lib/env";

export { CHAT_AGENT_ID, createChatAgent } from "./agents/chat-agent";

let _mastra: Mastra | null = null;

export function getMastra(): Mastra {
  if (_mastra) return _mastra;
  _mastra = new Mastra({
    storage: new PostgresStore({
      id: "wealthflow-mastra",
      connectionString: env.DATABASE_URL,
    }),
    logger: new PinoLogger({ name: "wealthflow-mastra", level: env.LOG_LEVEL as never }),
  });
  return _mastra;
}
