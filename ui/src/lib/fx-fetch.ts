/**
 * FX rate fetcher. Pulls the interbank (official) USD→* rates from a free source
 * and stores them. For the open-market ("grey") rate — which is the one that
 * actually applies to a Pakistani user — there's no reliable free API, so:
 *   - if FX_OPENMARKET_URL is set, fetch from it (expected: { quote: rate } JSON
 *     or { rates: { PKR: rate } });
 *   - otherwise, skip the open-market rate (metrics tolerate it being absent).
 *
 * Triggered by POST /api/cron/fx-rates (Coolify scheduled task / manual).
 */
import { desc } from "drizzle-orm";
import { env } from "./env";
import { db } from "../db";
import { fxRates } from "../db/schema";
import { insertRate } from "../db/fx";

// Currencies we care to track against USD (others ignored even if the feed has them).
const TRACKED_QUOTES = ["PKR", "EUR", "GBP", "AED", "INR"];

type FetchResult = {
  interbank: { quote: string; rate: number }[];
  openMarket: { quote: string; rate: number }[];
  source: { interbank: string; openMarket: string | null };
};

async function fetchInterbank(): Promise<{ source: string; rates: Record<string, number> }> {
  const url = env.FX_INTERBANK_URL;
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`interbank source ${url} returned ${res.status}`);
  const data = (await res.json()) as {
    base_code?: string;
    base?: string;
    rates?: Record<string, number>;
    conversion_rates?: Record<string, number>;
  };
  const base = (data.base_code ?? data.base ?? "USD").toUpperCase();
  if (base !== "USD") throw new Error(`interbank source base is ${base}, expected USD`);
  const rates = data.rates ?? data.conversion_rates;
  if (!rates) throw new Error("interbank source had no `rates`/`conversion_rates`");
  return { source: new URL(url).host, rates };
}

async function fetchOpenMarket(): Promise<{ source: string; rates: Record<string, number> } | null> {
  const url = env.FX_OPENMARKET_URL;
  if (!url) return null;
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`open-market source ${url} returned ${res.status}`);
  const data = (await res.json()) as Record<string, unknown> & { rates?: Record<string, number> };
  // Accept either { PKR: 305.2, ... } or { rates: { PKR: 305.2 } }
  const rates = (data.rates ?? data) as Record<string, number>;
  return { source: new URL(url).host, rates };
}

/**
 * Make sure we have *some* FX rates, fetching them on the fly if not. Called from
 * pages that need conversions (Money dashboard) so a fresh deployment isn't stuck
 * showing "no FX rate" until someone remembers to run the cron. Cheap: it only
 * fetches when the newest stored rate is older than `maxAgeHours` (default 18h) or
 * there are none at all. Failures are swallowed — the dashboard already tolerates
 * missing rates and shows its own banner.
 *
 * Best-effort + non-blocking-ish: it does await the fetch (so a first-ever load
 * gets rates), but the source (open.er-api.com) is fast. Concurrent calls may both
 * fetch; that just stores a couple of duplicate rows, which is harmless.
 */
export async function ensureFxRates(opts?: { maxAgeHours?: number }): Promise<void> {
  const maxAgeMs = (opts?.maxAgeHours ?? 18) * 3600_000;
  try {
    const latest = await db
      .select({ fetchedAt: fxRates.fetchedAt })
      .from(fxRates)
      .orderBy(desc(fxRates.fetchedAt))
      .limit(1);
    const fresh = latest[0]?.fetchedAt && Date.now() - latest[0].fetchedAt.getTime() < maxAgeMs;
    if (fresh) return;
    await fetchAndStoreFxRates();
  } catch (err) {
    console.error("[fx] ensureFxRates failed (dashboard will show the no-rates banner):", err);
  }
}

export async function fetchAndStoreFxRates(): Promise<FetchResult> {
  const inter = await fetchInterbank();
  const open = await fetchOpenMarket();

  const result: FetchResult = {
    interbank: [],
    openMarket: [],
    source: { interbank: inter.source, openMarket: open?.source ?? null },
  };

  for (const quote of TRACKED_QUOTES) {
    const r = inter.rates[quote];
    if (typeof r === "number" && r > 0) {
      await insertRate({ base: "USD", quote, rate: r.toString(), rateType: "interbank", source: inter.source });
      result.interbank.push({ quote, rate: r });
    }
    if (open) {
      const o = open.rates[quote];
      if (typeof o === "number" && o > 0) {
        await insertRate({ base: "USD", quote, rate: o.toString(), rateType: "open_market", source: open.source });
        result.openMarket.push({ quote, rate: o });
      }
    }
  }
  return result;
}
