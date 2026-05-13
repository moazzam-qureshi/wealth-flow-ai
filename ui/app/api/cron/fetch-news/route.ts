import { handler, json, requireApiUser } from "@/src/lib/api";
import { fetchAndStoreNews } from "@/src/lib/news-fetch";

// Manual re-run of the news ingester. Normally fires automatically via the
// in-process scheduler (src/lib/scheduler.ts); this endpoint exists so a logged-in
// user can trigger it on demand.
async function run() {
  await requireApiUser();
  const result = await fetchAndStoreNews();
  return json({ ok: true, ...result });
}

export const GET = handler(run);
export const POST = handler(run);
