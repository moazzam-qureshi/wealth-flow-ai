/**
 * In-process job scheduler. Runs inside the Next.js Node server (registered once
 * at startup by `instrumentation.ts`). No separate worker container, no Redis, no
 * cron daemon — just node-cron firing functions directly. Trade-off: if the app
 * is ever scaled to >1 replica every replica fires every job; the only deploy
 * (Coolify, single VPS) runs one. Easy to move to a dedicated worker later.
 *
 * Schedules (cron expressions in the server's local TZ):
 *   - fx-rates: every 6h
 *   - fetch-news: 6× a day (every 4h)
 *   - weekly-suggestions: Mondays at 09:00
 *
 * Server-only. Guards:
 *   - WEALTHFLOW_SCHEDULER=off → skipped entirely (set in dev to avoid noise)
 *   - Each job is wrapped in try/catch so a failure can't kill the process
 *   - Re-entrant: we record running jobs and skip a second tick if the previous
 *     run hasn't finished
 */
import cron from "node-cron";
import { fetchAndStoreFxRates } from "./fx-fetch";
import { fetchAndStoreNews } from "./news-fetch";
import { generateWeeklySuggestions } from "./suggestions";

type Job = { name: string; expr: string; run: () => Promise<unknown> };

const JOBS: Job[] = [
  { name: "fx-rates", expr: "0 */6 * * *", run: fetchAndStoreFxRates },
  { name: "fetch-news", expr: "0 */4 * * *", run: fetchAndStoreNews },
  { name: "weekly-suggestions", expr: "0 9 * * 1", run: generateWeeklySuggestions },
];

const running = new Set<string>();
let started = false;

export function startScheduler(): void {
  if (started) return; // hot-reload guard
  if (process.env.WEALTHFLOW_SCHEDULER === "off") {
    console.log("[scheduler] disabled (WEALTHFLOW_SCHEDULER=off)");
    return;
  }
  started = true;

  for (const job of JOBS) {
    cron.schedule(job.expr, () => void runOnce(job));
  }
  console.log(`[scheduler] registered ${JOBS.length} jobs: ${JOBS.map((j) => `${j.name}@${j.expr}`).join(", ")}`);

  // Catch-up tick: on cold start, fire each job once after a short delay so a
  // fresh deploy doesn't sit empty until the first scheduled time. Skip the
  // weekly-suggestions one (it's heavy and runs an LLM per user — don't do that on
  // every container restart).
  setTimeout(() => {
    void runOnce(JOBS[0]); // fx-rates
    void runOnce(JOBS[1]); // fetch-news
  }, 15_000);
}

async function runOnce(job: Job): Promise<void> {
  if (running.has(job.name)) {
    console.log(`[scheduler] ${job.name}: previous run still going, skipping this tick`);
    return;
  }
  running.add(job.name);
  const t0 = Date.now();
  try {
    const result = await job.run();
    const ms = Date.now() - t0;
    console.log(`[scheduler] ${job.name} ok in ${ms}ms`, summarize(result));
  } catch (err) {
    console.error(`[scheduler] ${job.name} failed after ${Date.now() - t0}ms:`, err);
  } finally {
    running.delete(job.name);
  }
}

function summarize(r: unknown): string {
  if (r && typeof r === "object") {
    try {
      const s = JSON.stringify(r);
      return s.length > 200 ? s.slice(0, 200) + "…" : s;
    } catch {
      return "(non-serializable result)";
    }
  }
  return String(r ?? "");
}
