/**
 * LLM model factory — all models come from OpenRouter (config-driven IDs so they
 * can be swapped without code changes). One place to change provider/model wiring.
 *
 * Server-only.
 */
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env, requireEnv } from "../lib/env";

let _provider: ReturnType<typeof createOpenRouter> | null = null;

function provider() {
  if (_provider) return _provider;
  // NOTE: don't pass `headers` here — for this provider that *replaces* the default
  // headers (including the Authorization bearer), which breaks auth. Attribution
  // headers (HTTP-Referer / X-Title) aren't required; skip them.
  _provider = createOpenRouter({
    apiKey: requireEnv("OPENROUTER_API_KEY"),
    baseURL: env.OPENROUTER_BASE_URL,
  });
  return _provider;
}

/** Qwen (cost-effective) text model — used by the strategist & chat agents. */
export function textModel() {
  return provider().chat(env.OPENROUTER_TEXT_MODEL);
}

/** Qwen (cost-effective) vision model — used by the screenshot extraction agent. */
export function visionModel() {
  return provider().chat(env.OPENROUTER_VISION_MODEL);
}
