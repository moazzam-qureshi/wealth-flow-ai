import { handler, json, requireApiUser } from "@/src/lib/api";
import { computeMetrics } from "@/src/db/cashflow";

// Deterministic dashboard numbers — net worth (USD + home, both FX rates), the
// USD↔home spread, currency exposure %, burn/runway/savings velocity. No LLM.
// Also used by Mastra's get-metrics tool (Step 4).
export const GET = handler(async (req: Request) => {
  const user = await requireApiUser();
  const url = new URL(req.url);
  const windowDays = Number(url.searchParams.get("windowDays")) || 90;
  const metrics = await computeMetrics(user.id, { windowDays });
  return json(metrics);
});
