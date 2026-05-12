import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { uploads, transactions } from "@/src/db/schema";
import { computeMetrics } from "@/src/db/cashflow";
import { requireUser } from "@/src/lib/session";
import { CaptureScreen } from "./_components/capture-screen";

// The home tab = the capture screen. Opening the app means you're ready to dump a
// transaction receipt — that's the whole point. Everything else is a tab away.
export const dynamic = "force-dynamic";

async function homeData(ownerId: string) {
  const [recentUploads, recentTxns, m] = await Promise.all([
    db
      .select({ id: uploads.id, blobKey: uploads.blobKey, status: uploads.status, uploadedAt: uploads.uploadedAt })
      .from(uploads)
      .where(eq(uploads.ownerId, ownerId))
      .orderBy(desc(uploads.uploadedAt))
      .limit(6),
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
    recentUploads: recentUploads.map((u) => ({ id: u.id, status: u.status, uploadedAt: u.uploadedAt.toISOString() })),
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
          recentUploads={data.recentUploads}
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
