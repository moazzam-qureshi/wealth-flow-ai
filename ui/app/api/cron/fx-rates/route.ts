import { handler, json, requireCron } from "@/src/lib/api";
import { fetchAndStoreFxRates } from "@/src/lib/fx-fetch";

// Refresh FX rates (interbank from a free source; open-market if FX_OPENMARKET_URL
// is configured). Hit by a Coolify scheduled task (Bearer CRON_SECRET) — also
// callable manually. GET is allowed too so you can trigger it from a browser/curl.
async function run(req: Request) {
  requireCron(req);
  const result = await fetchAndStoreFxRates();
  return json({ ok: true, ...result });
}

export const GET = handler(run);
export const POST = handler(run);
