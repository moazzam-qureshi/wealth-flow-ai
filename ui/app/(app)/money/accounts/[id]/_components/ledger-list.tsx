"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type LedgerRow = {
  id: string;
  amount: string;
  currency: string;
  direction: "in" | "out";
  txnType: "income" | "expense" | "transfer" | "investment";
  counterparty: string | null;
  category: string | null;
  occurredAt: string;
  status: "confirmed" | "needs_review";
  isTransfer: boolean;
  balanceAfter: string;
};

const TYPE_LABEL: Record<string, string> = { income: "Income", expense: "Expense", transfer: "Transfer", investment: "Investment" };

function money(v: string, ccy: string) {
  const n = Number(v);
  const sym = ccy === "USD" || ccy === "USDT" || ccy === "USDC" ? "$" : `${ccy} `;
  return `${sym}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function LedgerList({ accountId, currency, initial }: { accountId: string; currency: string; initial: LedgerRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function del(id: string) {
    setError(null);
    setConfirmId(null);
    const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't delete");
      return;
    }
    // re-fetch the ledger so running balances are recomputed correctly
    startTransition(async () => {
      const r = await fetch(`/api/accounts/${accountId}/transactions`);
      const d = await r.json();
      setRows((d.transactions ?? []) as LedgerRow[]);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {error && <div className="rounded-xl bg-[rgba(255,107,107,0.1)] px-3.5 py-2.5 text-[13px] text-[var(--coral)]">{error}</div>}
      <ul className="space-y-2">
        {rows.map((t) => {
          const inflow = t.direction === "in";
          const neg = Number(t.balanceAfter) < 0;
          return (
            <li key={t.id} className="rounded-2xl border border-line bg-[var(--card)] p-3.5">
              <div className="flex items-start gap-3">
                <span
                  className={"mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] " + (inflow ? "bg-[var(--mint-glow)] text-[var(--mint)]" : "bg-[rgba(255,107,107,0.12)] text-[var(--coral)]")}
                  title={inflow ? "in" : "out"}
                >
                  {inflow ? "↓" : "↑"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-[var(--fg)]">{t.counterparty || TYPE_LABEL[t.txnType] || t.txnType}</span>
                    <span className={"readout shrink-0 text-[15px] font-medium " + (inflow ? "text-[var(--mint)]" : "text-[var(--coral)]")}>
                      {inflow ? "+" : "−"}{money(t.amount, t.currency)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--fg-mut)]">
                    <span>{new Date(t.occurredAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
                    <span className="text-[var(--fg-faint)]">·</span>
                    <span>{TYPE_LABEL[t.txnType] ?? t.txnType}</span>
                    {t.category && (<><span className="text-[var(--fg-faint)]">·</span><span>{t.category}</span></>)}
                    {t.isTransfer && (<><span className="text-[var(--fg-faint)]">·</span><span className="text-[var(--cyan)]">transfer</span></>)}
                    {t.status === "needs_review" && (<><span className="text-[var(--fg-faint)]">·</span><span className="text-[var(--amber)]">needs review</span></>)}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className={"readout text-[11px] " + (neg ? "text-[var(--coral)]" : "text-[var(--fg-faint)]")}>balance after: {money(t.balanceAfter, currency)}</span>
                    {confirmId === t.id ? (
                      <span className="flex items-center gap-2 text-[11px]">
                        <button className="rounded-md bg-[rgba(255,107,107,0.15)] px-2 py-1 font-medium text-[var(--coral)]" disabled={pending} onClick={() => del(t.id)}>Delete</button>
                        <button className="rounded-md border border-line px-2 py-1 text-[var(--fg-mut)]" onClick={() => setConfirmId(null)}>Keep</button>
                      </span>
                    ) : (
                      <button className="text-[11px] text-[var(--fg-faint)] underline-offset-2 hover:text-[var(--coral)] hover:underline" onClick={() => setConfirmId(t.id)}>delete</button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-[var(--fg-faint)]">Deleting a transaction also reverses its effect on this account&apos;s balance. If it was half of a linked transfer, the other half stays but gets unlinked.</p>
    </div>
  );
}
