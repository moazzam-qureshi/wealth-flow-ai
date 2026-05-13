import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { transactions } from "@/src/db/schema";
import { computeMetrics } from "@/src/db/cashflow";
import { ensureFxRates } from "@/src/lib/fx-fetch";
import { requireUser } from "@/src/lib/session";
import { CaptureScreen } from "./_components/capture-screen";

// The home tab = the capture screen. Opening the app means you're ready to dump a
// transaction receipt — that's the whole point. Everything else is a tab away.
export const dynamic = "force-dynamic";

async function homeData(ownerId: string) {
  await ensureFxRates(); // keep the net-worth pill on the capture screen meaningful
  const [recentTxns, m] = await Promise.all([
    db
      .select({ occurredAt: transactions.occurredAt })
      .from(transactions)
      .where(eq(transactions.ownerId, ownerId))
      .orderBy(desc(transactions.occurredAt))
      .limit(50),
    computeMetrics(ownerId),
  ]);
  const weekAgo = Date.now() - 7 * 24 * 3600_000;
  const thisWeek = recentTxns.filter((t) => t.occurredAt.getTime() >= weekAgo).length;
  return {
    thisWeek,
    netWorthUsd: m.netWorth.usdOpenMarket ?? m.netWorth.usdInterbank,
    displayCurrency: m.displayCurrency,
    monthlyBurnUsd: m.cashflow.monthlyBurnUsd,
    hasAccounts: m.accountsCount > 0,
  };
}

export default async function HomeCapture() {
  const user = await requireUser();
  const data = await homeData(user.id);
  return (
    <div className="mx-auto w-full max-w-md px-4 pt-5 md:max-w-lg md:px-6 md:pt-7">
      <Suspense fallback={<div className="h-44 animate-pulse rounded-2xl bg-[var(--card)]" />}>
        <CaptureScreen
          thisWeek={data.thisWeek}
          netWorthUsd={data.netWorthUsd}
          displayCurrency={data.displayCurrency}
          monthlyBurnUsd={data.monthlyBurnUsd}
          hasAccounts={data.hasAccounts}
        />
      </Suspense>
    </div>
  );
}
