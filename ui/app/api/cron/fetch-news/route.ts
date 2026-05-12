import { handler, json, requireCron } from "@/src/lib/api";
import { fetchAndStoreNews } from "@/src/lib/news-fetch";

// Pull curated RSS, LLM-summarize + tag + "how this affects you", store in news_items.
// Hit by a Coolify scheduled task (Bearer CRON_SECRET) — also callable manually.
async function run(req: Request) {
  requireCron(req);
  const result = await fetchAndStoreNews();
  return json({ ok: true, ...result });
}

export const GET = handler(run);
export const POST = handler(run);
