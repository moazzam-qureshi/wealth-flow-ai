import Link from "next/link";
import { notFound } from "next/navigation";
import { listAccountTransactions } from "@/src/db/transactions";
import { ACCOUNT_TYPE_LABELS, getAccount } from "@/src/db/accounts";
import { requireUser } from "@/src/lib/session";
import { LedgerList, type LedgerRow } from "./_components/ledger-list";

export const dynamic = "force-dynamic";

// A single account's ledger: every transaction (newest first) with a running
// balance, and the ability to delete a wrong one (which reverses its effect).
export default async function AccountLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const acct = await getAccount(user.id, id);
  if (!acct) notFound();
  const ledger = await listAccountTransactions(user.id, id);
  if (!ledger) notFound();

  const rows: LedgerRow[] = ledger.rows.map((t) => ({
    id: t.id,
    amount: t.amount,
    currency: t.currency,
    direction: t.direction,
    txnType: t.txnType,
    counterparty: t.counterparty,
    category: t.category,
    occurredAt: t.occurredAt.toISOString(),
    status: t.status,
    isTransfer: !!t.transferLinkId,
    balanceAfter: t.balanceAfter,
  }));

  return (
    <div className="mx-auto w-full max-w-md space-y-4 px-4 pt-5 pb-8 md:max-w-lg md:px-6 md:pt-7">
      <div className="wf-rise">
        <Link href="/money/accounts" className="text-[12px] text-[var(--fg-mut)] underline-offset-2 hover:underline">← Accounts</Link>
        <h1 className="mt-2 font-display text-xl font-semibold tracking-tight">{acct.name}</h1>
        <p className="mt-0.5 text-[13px] text-[var(--fg-mut)]">
          {acct.institution ?? ACCOUNT_TYPE_LABELS[acct.type as keyof typeof ACCOUNT_TYPE_LABELS] ?? acct.type} · {acct.currency}
        </p>
      </div>

      <div className="card glow wf-rise p-5">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--fg-mut)]">Current balance</div>
        <div className={"readout mt-1 text-[32px] font-medium leading-none " + (Number(acct.currentBalance) < 0 ? "text-[var(--coral)]" : "text-[var(--fg)]")}>
          {fmtBal(acct.currentBalance, acct.currency)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/money/accounts" className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-[var(--fg-dim)] transition hover:bg-[var(--card-hi)]">Edit account / fix balance</Link>
          <Link href="/?manual=1" className="rounded-lg bg-[var(--mint-glow)] px-3 py-1.5 text-[12px] font-medium text-[var(--mint)] transition hover:brightness-110">+ Add a transaction</Link>
        </div>
        {Number(acct.currentBalance) < 0 && (
          <div className="mt-3 rounded-xl bg-[rgba(245,185,66,0.1)] px-3 py-2 text-[12px] text-[var(--amber)]">
            Balance is negative. If that&apos;s wrong, you probably entered a transaction before setting the opening balance — edit the account on the Accounts screen and set the real current amount, or delete the stray transaction below.
          </div>
        )}
      </div>

      <div className="wf-rise" style={{ animationDelay: "60ms" }}>
        <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-[var(--fg-mut)]">History · {rows.length}</div>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-5 text-center text-[13px] text-[var(--fg-mut)]">No transactions on this account yet.</div>
        ) : (
          <LedgerList accountId={acct.id} currency={acct.currency} initial={rows} />
        )}
      </div>
    </div>
  );
}

function fmtBal(v: string, ccy: string) {
  const n = Number(v);
  const sym = ccy === "USD" || ccy === "USDT" || ccy === "USDC" ? "$" : `${ccy} `;
  return `${sym}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
