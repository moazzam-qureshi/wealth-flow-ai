/**
 * Deterministic cashflow / net-worth math (Layer 4). NO LLM in this path — it's
 * the single source of truth for the dashboard numbers and for Mastra's
 * `get-metrics` tool.
 *
 * Conventions:
 *  - Money in/out of these functions is numeric strings; we go through Number()
 *    only for the final computed figures (display-grade), never to store.
 *  - "Net worth" is reported in BOTH USD and the home currency, at BOTH the
 *    interbank and open-market rates — the spread is signal.
 *  - Currencies with no FX rate available are listed under `unconvertible` so
 *    the UI can flag them rather than silently dropping them.
 */
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "./index";
import { accounts, fxRates, transactions } from "./schema";
import { getProfile } from "./profile";
import { isUsdEquivalent, usdRateMap } from "./fx";

// Everything here is owner-scoped: callers pass the authenticated user's id.

export type CurrencyBreakdown = {
  currency: string;
  /** sum of balances of accounts in this currency (native units) */
  native: number;
  /** value in USD (at the chosen rate type), or null if unconvertible */
  usd: number | null;
};

export type NetWorth = {
  /** total in USD at interbank / open-market rates */
  usdInterbank: number | null;
  usdOpenMarket: number | null;
  /** same, converted to the home currency for display */
  homeInterbank: number | null;
  homeOpenMarket: number | null;
  /** the USD→home spread as a % ((open-market - interbank)/interbank), or null */
  spreadPct: number | null;
  byCurrency: CurrencyBreakdown[];
  /** currencies present in accounts but with no FX rate yet */
  unconvertible: string[];
};

export type Exposure = {
  /** % of net worth (USD-denominated, open-market rates) held in USD-equivalents */
  usdPct: number | null;
  /** % held in the home currency */
  homePct: number | null;
  /** % held in everything else */
  otherPct: number | null;
};

export type Cashflow = {
  /** window used for the rate calculations */
  windowDays: number;
  /** average monthly money OUT (expenses + transfers-out treated as outflow? no — transfers are excluded) */
  monthlyBurnUsd: number | null;
  /** average monthly money IN (income only) */
  monthlyIncomeUsd: number | null;
  /** income - burn, per month */
  monthlySavingsUsd: number | null;
  /** months of runway = (liquid net worth) / monthlyBurn, or null if burn ~0 / unknown */
  runwayMonths: number | null;
  /** count of confirmed transactions in the window */
  txnCount: number;
};

export type Metrics = {
  homeCurrency: string;
  displayCurrency: string;
  netWorth: NetWorth;
  exposure: Exposure;
  cashflow: Cashflow;
  rateAsOf: { interbank: string | null; openMarket: string | null }; // ISO timestamps
  accountsCount: number;
};

const DAYS = 1000 * 60 * 60 * 24;

/** Sum the owner's active-account balances grouped by currency. */
async function balancesByCurrency(ownerId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ currency: accounts.currency, balance: accounts.currentBalance })
    .from(accounts)
    .where(and(eq(accounts.ownerId, ownerId), isNull(accounts.archived)));
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.currency, (m.get(r.currency) ?? 0) + Number(r.balance));
  }
  return m;
}

function convertMap(byCcy: Map<string, number>, usdPer: Map<string, number>) {
  let total = 0;
  let anyConverted = false;
  const unconvertible: string[] = [];
  const breakdown: CurrencyBreakdown[] = [];
  for (const [ccy, native] of byCcy) {
    let usd: number | null;
    if (isUsdEquivalent(ccy)) {
      usd = native;
    } else {
      const rate = usdPer.get(ccy.toUpperCase());
      usd = rate && rate > 0 ? native / rate : null;
    }
    if (usd === null) unconvertible.push(ccy);
    else {
      total += usd;
      anyConverted = true;
    }
    breakdown.push({ currency: ccy, native, usd });
  }
  return { total: anyConverted || byCcy.size === 0 ? total : null, unconvertible, breakdown };
}

/** Owner's confirmed transactions in the last `windowDays`, in USD, split by type. */
async function cashflowWindow(ownerId: string, windowDays: number, usdPer: Map<string, number>): Promise<Cashflow> {
  const since = new Date(Date.now() - windowDays * DAYS);
  const rows = await db
    .select({
      amount: transactions.amount,
      currency: transactions.currency,
      direction: transactions.direction,
      txnType: transactions.txnType,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.ownerId, ownerId),
        eq(transactions.status, "confirmed"),
        gte(transactions.occurredAt, since),
      ),
    );

  let incomeUsd = 0;
  let expenseUsd = 0;
  let convertibleSeen = false;
  for (const r of rows) {
    // transfers between own accounts and investments are not "burn" or "income"
    if (r.txnType === "transfer" || r.txnType === "investment") continue;
    let usd: number | null;
    if (isUsdEquivalent(r.currency)) usd = Number(r.amount);
    else {
      const rate = usdPer.get(r.currency.toUpperCase());
      usd = rate && rate > 0 ? Number(r.amount) / rate : null;
    }
    if (usd === null) continue;
    convertibleSeen = true;
    if (r.direction === "in" && r.txnType === "income") incomeUsd += usd;
    else if (r.direction === "out" && r.txnType === "expense") expenseUsd += usd;
  }

  const monthsInWindow = windowDays / 30;
  const monthlyBurnUsd = convertibleSeen ? expenseUsd / monthsInWindow : null;
  const monthlyIncomeUsd = convertibleSeen ? incomeUsd / monthsInWindow : null;
  const monthlySavingsUsd =
    monthlyIncomeUsd !== null && monthlyBurnUsd !== null ? monthlyIncomeUsd - monthlyBurnUsd : null;

  return {
    windowDays,
    monthlyBurnUsd,
    monthlyIncomeUsd,
    monthlySavingsUsd,
    runwayMonths: null, // filled by caller (needs net worth)
    txnCount: rows.filter((r) => r.txnType !== "transfer" && r.txnType !== "investment").length,
  };
}

export async function computeMetrics(ownerId: string, opts?: { windowDays?: number }): Promise<Metrics> {
  const windowDays = opts?.windowDays ?? 90;
  const [profile, byCcy, usdInter, usdOpenRaw, latestInter, latestOpen, acctCount] =
    await Promise.all([
      getProfile(ownerId),
      balancesByCurrency(ownerId),
      usdRateMap("interbank"),
      usdRateMap("open_market"),
      latestRateAsOf("interbank"),
      latestRateAsOf("open_market"),
      countActiveAccounts(ownerId),
    ]);

  // Open-market rates with interbank fallback per-currency: prefer the grey rate
  // (the one that actually applies), but if we don't have it for a currency, use
  // the official rate rather than silently dropping that currency.
  const usdOpenEffective = new Map<string, number>(usdInter);
  for (const [k, v] of usdOpenRaw) usdOpenEffective.set(k, v);

  const inter = convertMap(byCcy, usdInter);
  const open = convertMap(byCcy, usdOpenEffective);

  const home = profile.homeCurrency.toUpperCase();
  const homePerUsdInter = usdInter.get(home) ?? null;
  const homePerUsdOpen = usdOpenRaw.get(home) ?? null; // spread needs the *raw* grey rate

  const usdInterbank = inter.total;
  const usdOpenMarket = open.total;
  const homeInterbank =
    usdInterbank !== null && homePerUsdInter ? usdInterbank * homePerUsdInter : null;
  // for the "home" net worth at open-market we use the effective home rate
  const homePerUsdEff = usdOpenEffective.get(home) ?? null;
  const homeOpenMarket =
    usdOpenMarket !== null && homePerUsdEff ? usdOpenMarket * homePerUsdEff : null;
  const spreadPct =
    homePerUsdInter && homePerUsdOpen && homePerUsdInter > 0
      ? ((homePerUsdOpen - homePerUsdInter) / homePerUsdInter) * 100
      : null;

  // exposure: by USD value at effective (open-market preferred) rates
  const totalForExposure = open.total;
  let usdVal = 0;
  let homeVal = 0;
  let otherVal = 0;
  for (const b of open.breakdown) {
    if (b.usd === null) continue;
    if (isUsdEquivalent(b.currency)) usdVal += b.usd;
    else if (b.currency.toUpperCase() === home) homeVal += b.usd;
    else otherVal += b.usd;
  }
  const exposure: Exposure =
    totalForExposure && totalForExposure > 0
      ? {
          usdPct: (usdVal / totalForExposure) * 100,
          homePct: (homeVal / totalForExposure) * 100,
          otherPct: (otherVal / totalForExposure) * 100,
        }
      : { usdPct: null, homePct: null, otherPct: null };

  const cashflow = await cashflowWindow(ownerId, windowDays, usdOpenEffective);
  // runway uses net worth as the "liquid" pool (v1 — everything is liquid)
  const liquidUsd = usdOpenMarket ?? usdInterbank;
  cashflow.runwayMonths =
    liquidUsd !== null && cashflow.monthlyBurnUsd && cashflow.monthlyBurnUsd > 0
      ? liquidUsd / cashflow.monthlyBurnUsd
      : null;

  return {
    homeCurrency: home,
    displayCurrency: profile.displayCurrencyPref.toUpperCase(),
    netWorth: {
      usdInterbank,
      usdOpenMarket,
      homeInterbank,
      homeOpenMarket,
      spreadPct,
      byCurrency: open.breakdown, // open-market-preferred rates
      unconvertible: open.unconvertible,
    },
    exposure,
    cashflow,
    rateAsOf: { interbank: latestInter, openMarket: latestOpen },
    accountsCount: acctCount,
  };
}

async function latestRateAsOf(rateType: "interbank" | "open_market"): Promise<string | null> {
  const rows = await db
    .select({ fetchedAt: fxRates.fetchedAt })
    .from(fxRates)
    .where(eq(fxRates.rateType, rateType))
    .orderBy(desc(fxRates.fetchedAt))
    .limit(1);
  return rows[0]?.fetchedAt ? rows[0].fetchedAt.toISOString() : null;
}

async function countActiveAccounts(ownerId: string): Promise<number> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.ownerId, ownerId), isNull(accounts.archived)));
  return rows.length;
}
