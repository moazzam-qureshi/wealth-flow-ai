/**
 * Next.js instrumentation hook — runs once per server process at startup. We use
 * it to register the in-process job scheduler (FX rates, news, weekly suggestions)
 * so deploys don't need any external cron / scheduled-task setup.
 *
 * Only runs in the Node runtime (NEXT_RUNTIME === "nodejs"); skipped at build time
 * and on the Edge runtime where DB clients won't work.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("./src/lib/scheduler");
  startScheduler();
}
