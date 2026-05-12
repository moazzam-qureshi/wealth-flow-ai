import { handler, json, requireCron } from "@/src/lib/api";
import { generateWeeklySuggestions } from "@/src/lib/suggestions";

// Assemble the user's snapshot → ask the strategist (Qwen text) for 1–3 grounded
// leverage suggestions → store in `recommendations`. Hit by a Coolify weekly task
// (Bearer CRON_SECRET) — also callable manually.
async function run(req: Request) {
  requireCron(req);
  const result = await generateWeeklySuggestions();
  return json({ ok: true, ...result });
}

export const GET = handler(run);
export const POST = handler(run);
