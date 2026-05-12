import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { listAccounts } from "@/src/db/accounts";
import { computeMetrics } from "@/src/db/cashflow";
import { db } from "@/src/db";
import { recommendations } from "@/src/db/schema";
import { Card, SectionLabel, Stat, RunwayMeter, ExposureBar, CcyAvatar, fmtMoney } from "../_components/ui";

export const dynamic = "force-dynamic";

async function topNewRecommendation() {
  const rows = await db
    .select({ id: recommendations.id, title: recommendations.title, body: recommendations.body })
    .from(recommendations)
    .where(eq(recommendations.status, "new"))
    .orderBy(desc(recommendations.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

// "Money" — the operator's instrument panel. Net worth (hero), the USD↔home FX
// spread, runway fuel-gauge, currency-exposure light-strip, cashflow, accounts.
export default async function MoneyScreen() {
  const [accounts, m, topRec] = await Promise.all([listAccounts(), computeMetrics(), topNewRecommendation()]);
  const nw = m.netWorth;
  const haveRates = nw.usdInterbank !== null || nw.usdOpenMarket !== null;
  const primaryUsd = nw.usdOpenMarket ?? nw.usdInterbank;
  const primaryHome = nw.homeOpenMarket ?? nw.homeInterbank;
  const dc = m.displayCurrency;
  const primaryNW = dc === m.homeCurrency ? primaryHome : primaryUsd;
  const secondaryNW = dc === m.homeCurrency ? primaryUsd : primaryHome;
  const secondaryCcy = dc === m.homeCurrency ? "USD" : m.homeCurrency;
  const rateLabel = nw.spreadPct !== null ? "open-market rates" : "best available rates";

  return (
    <div className="mx-auto w-full max-w-md space-y-4 px-4 pt-5 pb-8 md:max-w-lg md:px-6 md:pt-7">
      {accounts.length === 0 ? (
        <Card className="wf-rise p-7 text-center">
          <div className="font-display text-base font-semibold">Map your financial reality first</div>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-[var(--fg-mut)]">
            Add your accounts — banks, fintech apps, exchanges, wallets, cash. Then the numbers light up.
          </p>
          <Link href="/money/accounts" className="mt-4 inline-block rounded-xl bg-[var(--mint)] px-4 py-2.5 text-sm font-semibold text-[#04130d]">Add accounts</Link>
        </Card>
      ) : (
        <>
          {/* ── hero: net worth ─────────────────────────────────────────── */}
          <Card glow className="wf-rise relative overflow-hidden p-6">
            <span className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[var(--mint-glow)] blur-3xl" />
            <div className="relative">
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--fg-mut)]">Net worth</div>
              <div className="readout mt-1 text-[40px] font-medium leading-none text-[var(--fg)]">
                {fmtMoney(primaryNW, dc)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--fg-mut)]">
                <span className="readout">{secondaryCcy === "USD" ? "$" : `${secondaryCcy} `}{secondaryNW !== null ? secondaryNW.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}</span>
                <span className="text-[var(--fg-faint)]">·</span>
                <span>{haveRates ? rateLabel : "native balances only — no FX rate yet"}</span>
              </div>
            </div>
            {!haveRates && (
              <div className="relative mt-4 rounded-xl bg-[rgba(245,185,66,0.1)] px-3 py-2 text-[12px] text-[var(--amber)]">
                No FX rates stored. Run the rate refresh once (the <code>cron/fx-rates</code> task) to convert everything.
              </div>
            )}
          </Card>

          {/* ── 1 thing to look at this week ────────────────────────────── */}
          {topRec ? (
            <Link href="/ideas" className="card glow wf-rise block overflow-hidden p-4 transition hover:bg-[var(--card-hi)]" style={{ animationDelay: "60ms" }}>
              <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] text-[var(--mint)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--mint)]" /> 1 thing to look at this week
              </div>
              <div className="mt-1.5 font-display text-[15px] font-semibold">{topRec.title}</div>
              <div className="mt-1 line-clamp-2 text-[13px] text-[var(--fg-mut)]">{topRec.body}</div>
              <div className="mt-2 text-[12px] text-[var(--fg-faint)]">See reasoning &amp; all ideas →</div>
            </Link>
          ) : (
            <Link href="/ideas" className="wf-rise block rounded-2xl border border-dashed border-line p-4 text-[13px] text-[var(--fg-mut)] transition hover:border-[var(--line)] hover:bg-[var(--bg-soft)]" style={{ animationDelay: "60ms" }}>
              No new idea right now — weekly leverage ideas show up here.
            </Link>
          )}

          {/* ── runway fuel gauge ──────────────────────────────────────── */}
          <Card className="wf-rise p-4" style={{ animationDelay: "100ms" }}>
            <RunwayMeter months={m.cashflow.runwayMonths} />
            <div className="mt-3 flex items-center gap-2 text-[11px] text-[var(--fg-mut)]">
              <span>burn ≈ {fmtMoney(m.cashflow.monthlyBurnUsd, "USD")}/mo</span>
              <span className="text-[var(--fg-faint)]">·</span>
              <span>income ≈ {fmtMoney(m.cashflow.monthlyIncomeUsd, "USD")}/mo</span>
              <span className="text-[var(--fg-faint)]">·</span>
              <span className={m.cashflow.monthlySavingsUsd !== null && m.cashflow.monthlySavingsUsd < 0 ? "text-[var(--coral)]" : "text-[var(--mint)]"}>
                {m.cashflow.monthlySavingsUsd === null ? "" : (m.cashflow.monthlySavingsUsd >= 0 ? "+" : "−") + fmtMoney(Math.abs(m.cashflow.monthlySavingsUsd), "USD") + "/mo"}
              </span>
            </div>
            <div className="mt-1 text-[10.5px] text-[var(--fg-faint)]">over the last {m.cashflow.windowDays} days · {m.cashflow.txnCount} transactions</div>
          </Card>

          {/* ── currency exposure light-strip ──────────────────────────── */}
          <Card className="wf-rise p-4" style={{ animationDelay: "140ms" }}>
            <SectionLabel>Currency exposure</SectionLabel>
            <ExposureBar usdPct={m.exposure.usdPct} homePct={m.exposure.homePct} otherPct={m.exposure.otherPct} homeCurrency={m.homeCurrency} />
          </Card>

          {/* ── FX spread ──────────────────────────────────────────────── */}
          <div className="wf-rise grid grid-cols-2 gap-3" style={{ animationDelay: "180ms" }}>
            <Stat
              label={`USD ↔ ${m.homeCurrency} spread`}
              value={nw.spreadPct === null ? "—" : `${nw.spreadPct >= 0 ? "+" : ""}${nw.spreadPct.toFixed(1)}%`}
              sub={nw.spreadPct === null ? "no open-market rate set" : "open-market vs interbank"}
              tone={nw.spreadPct !== null && nw.spreadPct > 3 ? "amber" : "neutral"}
            />
            <Stat
              label="Saving rate / mo"
              value={m.cashflow.monthlySavingsUsd === null ? "—" : `${m.cashflow.monthlySavingsUsd >= 0 ? "+" : "−"}$${Math.abs(m.cashflow.monthlySavingsUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              sub="income − burn"
              tone={m.cashflow.monthlySavingsUsd !== null && m.cashflow.monthlySavingsUsd < 0 ? "coral" : "mint"}
            />
          </div>

          {/* ── your financial reality (capability graph) ──────────────── */}
          <Link href="/money/profile" className="card wf-rise block p-4 transition hover:bg-[var(--card-hi)]" style={{ animationDelay: "200ms" }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--fg-mut)]">Your financial reality</div>
                <div className="mt-1 text-[13px] text-[var(--fg-dim)]">
                  What you can actually do — US stocks, foreign currency, money movement, payment rails. The strategist reads this.
                </div>
              </div>
              <span className="ml-3 shrink-0 text-[var(--fg-mut)]">→</span>
            </div>
          </Link>

          {/* ── accounts ───────────────────────────────────────────────── */}
          <div className="wf-rise" style={{ animationDelay: "240ms" }}>
            <SectionLabel action={<Link href="/money/accounts" className="text-[11px] text-[var(--fg-mut)] underline-offset-2 hover:underline">manage</Link>}>
              Accounts · {accounts.length}
            </SectionLabel>
            <ul className="space-y-2">
              {accounts.map((a) => {
                const usdy = ["USD", "USDT", "USDC"].includes(a.currency.toUpperCase());
                return (
                  <li key={a.id}>
                    <Card className={"flex items-center gap-3 p-3 " + (usdy ? "bg-[linear-gradient(180deg,rgba(79,227,176,0.04),transparent)]" : "")}>
                      <CcyAvatar currency={a.currency} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[var(--fg)]">{a.name}</div>
                        <div className="truncate text-[11px] text-[var(--fg-mut)]">{a.institution ?? typeLabel(a.type)}</div>
                      </div>
                      <div className="readout shrink-0 text-right text-[14px] font-medium text-[var(--fg)]">
                        {a.currency === "USD" || a.currency === "USDT" || a.currency === "USDC" ? "$" : `${a.currency} `}
                        {Number(a.currentBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
            {nw.unconvertible.length > 0 && (
              <p className="mt-2 text-[11px] text-[var(--amber)]">
                No FX rate yet for {nw.unconvertible.join(", ")} — not counted in the totals.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function typeLabel(t: string) {
  return ({ local_bank: "Local bank", usd_bank: "USD bank", fintech: "Fintech", brokerage: "Brokerage", crypto_exchange: "Crypto exchange", stablecoin_wallet: "Stablecoin wallet", cash: "Cash" } as Record<string, string>)[t] ?? t;
}
