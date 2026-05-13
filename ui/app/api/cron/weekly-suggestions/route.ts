import { handler, json, requireApiUser } from "@/src/lib/api";
import { generateWeeklySuggestions } from "@/src/lib/suggestions";

// Manual re-run of the weekly-suggestions pass (loops over all users). Normally
// fires Mondays 09:00 via the in-process scheduler; this endpoint exists so a
// logged-in user can trigger it on demand.
async function run() {
  await requireApiUser();
  const result = await generateWeeklySuggestions();
  return json({ ok: true, ...result });
}

export const GET = handler(run);
export const POST = handler(run);
