import { handler, json, requireApiUser } from "@/src/lib/api";
import { fetchAndStoreFxRates } from "@/src/lib/fx-fetch";

// Manual re-run of the FX-rates refresh. Normally fires automatically via the
// in-process scheduler (src/lib/scheduler.ts); this endpoint exists so a logged-in
// user can trigger it on demand (e.g. from the dashboard's "Get rates" button).
async function run() {
  await requireApiUser();
  const result = await fetchAndStoreFxRates();
  return json({ ok: true, ...result });
}

export const GET = handler(run);
export const POST = handler(run);
