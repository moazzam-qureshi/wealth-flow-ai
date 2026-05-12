"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CcyAvatar, SectionLabel, buttonGhost, buttonPrimary } from "../../../_components/ui";

export type ClientAccount = {
  id: string;
  name: string;
  type: string;
  currency: string;
  institution: string | null;
  currentBalance: string;
  notes: string | null;
  archived: string | null;
};

const ACCOUNT_TYPES = [
  ["local_bank", "Local bank"],
  ["usd_bank", "USD bank"],
  ["fintech", "Fintech app"],
  ["brokerage", "Brokerage (stocks)"],
  ["crypto_exchange", "Crypto exchange"],
  ["stablecoin_wallet", "Stablecoin wallet"],
  ["cash", "Cash"],
] as const;
const TYPE_LABEL = Object.fromEntries(ACCOUNT_TYPES) as Record<string, string>;
const COMMON_CURRENCIES = ["PKR", "USD", "EUR", "GBP", "AED", "USDT", "USDC"];

function fmt(balance: string, currency: string) {
  const n = Number(balance);
  const sym = currency === "USD" || currency === "USDT" || currency === "USDC" ? "$" : `${currency} `;
  return `${sym}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function AccountsManager({ initialAccounts }: { initialAccounts: ClientAccount[] }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [editing, setEditing] = useState<ClientAccount | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    startTransition(async () => {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data.accounts ?? []);
      router.refresh();
    });
  }
  async function save(form: AccountForm, id?: string) {
    setError(null);
    const res = await fetch(id ? `/api/accounts/${id}` : "/api/accounts", {
      method: id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Save failed");
      return;
    }
    setAdding(false);
    setEditing(null);
    refresh();
  }
  async function setArchived(id: string, archived: boolean) {
    setError(null);
    const res = await fetch(`/api/accounts/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ archived }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Update failed"); return; }
    refresh();
  }

  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  return (
    <div className="space-y-3">
      {error && <div className="rounded-xl bg-[rgba(255,107,107,0.1)] px-3.5 py-2.5 text-[13px] text-[var(--coral)]">{error}</div>}

      {active.length === 0 && !adding && (
        <Card className="wf-rise p-6 text-center text-[13px] text-[var(--fg-mut)]">No accounts yet. Add your first one below.</Card>
      )}

      <ul className="space-y-2">
        {active.map((a) =>
          editing?.id === a.id ? (
            <li key={a.id}>
              <Card className="wf-rise p-3.5">
                <AccountForm initial={a} busy={pending} onCancel={() => setEditing(null)} onSubmit={(f) => save(f, a.id)} />
              </Card>
            </li>
          ) : (
            <li key={a.id}>
              <Card className="flex items-center gap-3 p-3">
                <CcyAvatar currency={a.currency} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[var(--fg)]">{a.name}</div>
                  <div className="truncate text-[11px] text-[var(--fg-mut)]">{a.institution ?? TYPE_LABEL[a.type] ?? a.type}{a.notes ? ` · ${a.notes}` : ""}</div>
                </div>
                <div className="readout shrink-0 text-right text-[14px] font-medium text-[var(--fg)]">{fmt(a.currentBalance, a.currency)}</div>
                <div className="ml-1 flex shrink-0 flex-col gap-1">
                  <button className="text-[10.5px] text-[var(--fg-mut)] hover:text-[var(--fg)]" onClick={() => { setAdding(false); setEditing(a); }}>edit</button>
                  <button className="text-[10.5px] text-[var(--fg-faint)] hover:text-[var(--coral)]" onClick={() => setArchived(a.id, true)}>archive</button>
                </div>
              </Card>
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <Card className="wf-rise p-3.5">
          <AccountForm busy={pending} onCancel={() => setAdding(false)} onSubmit={(f) => save(f)} />
        </Card>
      ) : (
        <button className={buttonPrimary("w-full")} onClick={() => { setEditing(null); setAdding(true); }}>+ Add account</button>
      )}

      {archived.length > 0 && (
        <details className="text-[13px] text-[var(--fg-mut)]">
          <summary className="cursor-pointer select-none">Archived · {archived.length}</summary>
          <ul className="mt-2 space-y-1.5">
            {archived.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-[var(--card)] px-3.5 py-2.5">
                <span className="truncate text-[var(--fg-dim)]">{a.name} · {TYPE_LABEL[a.type] ?? a.type} · {a.currency}</span>
                <button className="text-[10.5px] text-[var(--fg-mut)] underline" onClick={() => setArchived(a.id, false)}>restore</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

type AccountForm = { name: string; type: string; currency: string; institution?: string; currentBalance?: string; notes?: string };

function AccountForm({ initial, busy, onCancel, onSubmit }: { initial?: ClientAccount; busy: boolean; onCancel: () => void; onSubmit: (f: AccountForm) => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "local_bank");
  const [currency, setCurrency] = useState(initial?.currency ?? "PKR");
  const [institution, setInstitution] = useState(initial?.institution ?? "");
  const [balance, setBalance] = useState(initial?.currentBalance ?? "0");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  return (
    <form
      className="space-y-2.5"
      onSubmit={(e) => { e.preventDefault(); onSubmit({ name, type, currency, institution: institution || undefined, currentBalance: balance || "0", notes: notes || undefined }); }}
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Field label="Name"><input className="w-full px-3 py-2.5 text-sm" placeholder="Meezan PKR" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Institution"><input className="w-full px-3 py-2.5 text-sm" placeholder="Meezan Bank" value={institution} onChange={(e) => setInstitution(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <Field label="Type"><select className="w-full px-3 py-2.5 text-sm" value={type} onChange={(e) => setType(e.target.value)}>{ACCOUNT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Currency">
          <input list="ccy-list" className="readout w-full px-3 py-2.5 text-sm uppercase" placeholder="PKR" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} required />
          <datalist id="ccy-list">{COMMON_CURRENCIES.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Balance"><input className="readout w-full px-3 py-2.5 text-right text-sm" inputMode="decimal" placeholder="0" value={balance} onChange={(e) => setBalance(e.target.value)} /></Field>
      </div>
      <Field label="Notes (optional)"><input className="w-full px-3 py-2.5 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={buttonPrimary("flex-1")}>Save</button>
        <button type="button" onClick={onCancel} className={buttonGhost()}>Cancel</button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--fg-mut)]">{label}</span>
      {children}
    </label>
  );
}
