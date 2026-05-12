/**
 * FX rates. We track both the interbank (official) rate and the open-market
 * (free-market / "grey") rate for USD↔home-currency — the spread between them is
 * itself signal ("your PKR is worth less than your bank says"). Stablecoins
 * (USDT/USDC) are treated 1:1 with USD.
 *
 * `rate` is stored as "quote units per 1 base unit" — e.g. base=USD, quote=PKR,
 * rate=280  ⇒  1 USD = 280 PKR.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "./index";
import { fxRates, type FxRate, type NewFxRate } from "./schema";

export type RateType = "interbank" | "open_market";

/** Currencies we treat as exactly 1 USD (no FX lookup needed). */
const USD_EQUIVALENT = new Set(["USD", "USDT", "USDC", "USDP", "DAI"]);

export function isUsdEquivalent(currency: string): boolean {
  return USD_EQUIVALENT.has(currency.trim().toUpperCase());
}

/** Latest stored rate for a pair + type, or undefined if none yet. */
export async function getLatestRate(
  base: string,
  quote: string,
  rateType: RateType,
): Promise<FxRate | undefined> {
  const rows = await db
    .select()
    .from(fxRates)
    .where(
      and(
        eq(fxRates.base, base.toUpperCase()),
        eq(fxRates.quote, quote.toUpperCase()),
        eq(fxRates.rateType, rateType),
      ),
    )
    .orderBy(desc(fxRates.fetchedAt))
    .limit(1);
  return rows[0];
}

/** All "latest of each (pair,type)" rows — handy for the dashboard. */
export async function getLatestRates(): Promise<FxRate[]> {
  // small table; just pull recent and dedupe in JS
  const rows = await db.select().from(fxRates).orderBy(desc(fxRates.fetchedAt)).limit(50);
  const seen = new Set<string>();
  const out: FxRate[] = [];
  for (const r of rows) {
    const k = `${r.base}/${r.quote}/${r.rateType}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export async function insertRate(input: NewFxRate): Promise<FxRate> {
  const rows = await db
    .insert(fxRates)
    .values({ ...input, base: input.base.toUpperCase(), quote: input.quote.toUpperCase() })
    .returning();
  return rows[0]!;
}

/**
 * Convert `amount` from `currency` → USD using the given rate type.
 * - USD-equivalents: 1:1.
 * - Otherwise we expect a USD→<currency> rate (PKR per USD) and divide.
 * Returns a string (numeric-safe) or null if no rate is available.
 */
export function toUsd(
  amount: string,
  currency: string,
  usdToQuote: Map<string, number>, // currency → (quote units per 1 USD)
): string | null {
  if (isUsdEquivalent(currency)) return amount;
  const rate = usdToQuote.get(currency.toUpperCase());
  if (!rate || rate <= 0) return null;
  // amount (in `currency`) / rate (currency-per-USD) = USD
  const n = Number(amount) / rate;
  return n.toFixed(4);
}

/** Build a lookup of currency → (units per 1 USD) for a rate type, from `fxRates`. */
export async function usdRateMap(rateType: RateType): Promise<Map<string, number>> {
  const rows = await db
    .select()
    .from(fxRates)
    .where(and(eq(fxRates.base, "USD"), eq(fxRates.rateType, rateType)))
    .orderBy(desc(fxRates.fetchedAt));
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!map.has(r.quote)) map.set(r.quote, Number(r.rate));
  }
  return map;
}
