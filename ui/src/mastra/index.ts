/**
 * Mastra instance — runs IN-PROCESS inside the Next.js app (no separate server).
 * Built lazily via `getMastra()` so `next build` doesn't evaluate it (and doesn't
 * need OPENROUTER_API_KEY at build time). Route handlers / server actions call
 * `getMastra()`.
 *
 * Storage + memory share the app's Postgres (Mastra creates its own `mastra_*`
 * tables at runtime — not part of our Drizzle migrations).
 *
 * Server-only.
 */
import { Mastra } from "@mastra/core/mastra";
import { PostgresStore } from "@mastra/pg";
import { PinoLogger } from "@mastra/loggers";
import { env } from "../lib/env";
import { createChatAgent, CHAT_AGENT_ID } from "./agents/chat-agent";

export { CHAT_AGENT_ID };

let _mastra: Mastra | null = null;

export function getMastra(): Mastra {
  if (_mastra) return _mastra;
  _mastra = new Mastra({
    agents: {
      [CHAT_AGENT_ID]: createChatAgent(),
    },
    storage: new PostgresStore({
      id: "wealthflow-mastra",
      connectionString: env.DATABASE_URL,
    }),
    logger: new PinoLogger({ name: "wealthflow-mastra", level: env.LOG_LEVEL as never }),
  });
  return _mastra;
}
