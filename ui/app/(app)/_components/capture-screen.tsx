"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { buttonGhost, buttonPrimary } from "./ui";

// ── types coming back from the API ───────────────────────────────────────────
type Account = { id: string; name: string; currency: string; institution: string | null };
type ReviewTxn = {
  amount: number;
  currency: string;
  direction: "in" | "out";
  txnType: "income" | "expense" | "transfer" | "investment";
  counterparty: string | null;
  category: string | null;
  externalId: string | null;
  occurredAt: string | null;
  confidence: number;
  duplicateOf: string | null;
};
type ExtractResponse = {
  uploadId: string;
  blobKey: string;
  detectedInstitution: string | null;
  suggestedAccountId: string | null;
  accounts: Account[];
  transactions: ReviewTxn[];
  notes: string | null;
};
type TransferCandidate = { id: string; accountId: string; amount: string; currency: string; direction: "in" | "out"; counterparty: string | null; occurredAt: string };
type SaveResponse = {
  transaction: { id: string };
  transferCandidates: TransferCandidate[];
  // optional payoff figures (the API may add these; we also re-fetch /api/metrics)
};

const TXN_TYPES = [
  ["expense", "Expense"],
  ["income", "Income"],
  ["transfer", "Transfer"],
  ["investment", "Investment"],
] as const;

const ACCOUNT_TYPES = [
  ["fintech", "Fintech app"],
  ["local_bank", "Local bank"],
  ["usd_bank", "USD bank"],
  ["brokerage", "Brokerage (stocks)"],
  ["crypto_exchange", "Crypto exchange"],
  ["stablecoin_wallet", "Stablecoin wallet"],
  ["cash", "Cash"],
] as const;
const COMMON_CURRENCIES = ["PKR", "USD", "EUR", "GBP", "AED", "USDT", "USDC"];

function isoLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function dollars(n: number | null) {
  return n === null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

type Phase = "idle" | "uploading" | "review" | "saved" | "manual";

export function CaptureScreen(props: {
  thisWeek: number;
  netWorthUsd: number | null;
  displayCurrency: string;
  monthlyBurnUsd: number | null;
  hasAccounts: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extract, setExtract] = useState<ExtractResponse | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]); // local copy so a freshly-created one shows up
  const [accountId, setAccountId] = useState("");
  const [newAccount, setNewAccount] = useState<{ name: string; type: string; currency: string } | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);
  // destAccountId: the OTHER account a transfer/investment lands in. Only used
  // when txnType is "transfer" | "investment"; required at save time.
  const [drafts, setDrafts] = useState<(ReviewTxn & { occurredLocal: string; destAccountId: string | null })[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [payoff, setPayoff] = useState<{ netWorthUsd: number | null; monthlyBurnUsd: number | null } | null>(null);
  const [transferPrompt, setTransferPrompt] = useState<{ savedTxnId: string; candidates: TransferCandidate[] } | null>(null);

  // arrived from the Web Share Target → ?uploadId=… ; process it on mount
  const sharedUploadId = params.get("uploadId");
  const wantManual = params.get("manual") === "1";
  useEffect(() => {
    if (sharedUploadId && !extract) {
      setPhase("uploading");
      (async () => {
        try {
          const res = await fetch(`/api/uploads/${sharedUploadId}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Couldn't process shared image");
          enterReview(data as ExtractResponse);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't process shared image");
          setPhase("idle");
        }
      })();
    } else if (wantManual) {
      setPhase("manual");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedUploadId, wantManual]);

  function enterReview(r: ExtractResponse) {
    setExtract(r);
    setAccounts(r.accounts);
    setAccountId(r.suggestedAccountId ?? r.accounts[0]?.id ?? "");
    setNewAccount(null);
    // No matching account but the model detected an institution → prefill a "create" form.
    if (!r.suggestedAccountId && r.accounts.length === 0 && r.detectedInstitution) {
      const ccy = r.transactions[0]?.currency?.toUpperCase() || "PKR";
      setNewAccount({ name: r.detectedInstitution, type: "fintech", currency: ccy });
    }
    setDrafts(
      r.transactions.map((t) => ({
        ...t,
        occurredLocal: t.occurredAt ? isoLocal(new Date(t.occurredAt)) : isoLocal(new Date()),
        destAccountId: null,
      })),
    );
    setPhase("review");
  }

  async function createAccount() {
    if (!newAccount || !newAccount.name.trim()) { setError("Give the account a name."); return; }
    setCreatingAccount(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newAccount.name.trim(), type: newAccount.type, currency: newAccount.currency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create the account");
      const acc = data.account as { id: string; name: string; currency: string; institution: string | null };
      setAccounts((a) => [...a, { id: acc.id, name: acc.name, currency: acc.currency, institution: acc.institution }]);
      setAccountId(acc.id);
      setNewAccount(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the account");
    } finally {
      setCreatingAccount(false);
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setPhase("uploading");
    const fd = new FormData();
    fd.append("file", file);
    if (accountId) fd.append("accountId", accountId);
    try {
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      enterReview(data as ExtractResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPhase("idle");
    }
  }

  function patchDraft(i: number, patch: Partial<(typeof drafts)[number]>) {
    setDrafts((d) => d.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  async function saveOne(i: number) {
    setError(null);
    const t = drafts[i];
    if (!accountId) return setError(newAccount ? 'Tap "Create & use" to add the account first.' : "Pick an account first.");
    if (!t.externalId) return setError("This receipt has no reference id — type it in (look on the receipt) so duplicates can be caught.");

    const twoLegged = t.txnType === "transfer" || t.txnType === "investment";
    if (twoLegged) {
      if (!t.destAccountId) return setError(`Pick the destination account — where the money lands for this ${t.txnType}.`);
      if (t.destAccountId === accountId) return setError("Source and destination must be different accounts.");
    }

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          // Two-legged moves are recorded as the OUT leg on the source; the dest
          // leg is created automatically on the server.
          destAccountId: twoLegged ? t.destAccountId : null,
          uploadId: extract?.uploadId ?? null,
          externalId: t.externalId,
          amount: t.amount,
          currency: t.currency,
          direction: twoLegged ? "out" : t.direction,
          txnType: t.txnType,
          counterparty: t.counterparty,
          category: t.category,
          occurredAt: new Date(t.occurredLocal).toISOString(),
          confidence: t.confidence,
        }),
      });
      const data = (await res.json()) as SaveResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSavedCount((c) => c + 1);
      setDrafts((d) => d.filter((_, idx) => idx !== i));
      if (Array.isArray(data.transferCandidates) && data.transferCandidates.length > 0) {
        setTransferPrompt({ savedTxnId: data.transaction.id, candidates: data.transferCandidates });
      }
      // micro-payoff: re-read the metrics so we can show the one number that changed
      try {
        const m = await (await fetch("/api/metrics")).json();
        setPayoff({ netWorthUsd: m?.netWorth?.usdOpenMarket ?? m?.netWorth?.usdInterbank ?? null, monthlyBurnUsd: m?.cashflow?.monthlyBurnUsd ?? null });
      } catch {
        setPayoff({ netWorthUsd: props.netWorthUsd, monthlyBurnUsd: props.monthlyBurnUsd });
      }
      if (drafts.length <= 1) {
        setPhase("saved");
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function linkTransfer(otherId: string | null) {
    if (!transferPrompt) return;
    if (otherId) {
      await fetch("/api/transactions/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txnIdA: transferPrompt.savedTxnId, txnIdB: otherId }),
      });
    }
    setTransferPrompt(null);
  }

  function reset() {
    setPhase("idle");
    setExtract(null);
    setAccounts([]);
    setNewAccount(null);
    setDrafts([]);
    setSavedCount(0);
    setPayoff(null);
    setTransferPrompt(null);
    setPreviewUrl(null);
    setError(null);
    fileRef.current && (fileRef.current.value = "");
  }

  // No `capture` attribute: transaction screenshots are already in the gallery,
  // so we want the OS picker (Photos / Files / Camera) — `capture` would force the camera.
  const hiddenInput = (
    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
  );

  // ── SAVED — micro-payoff, then ready for the next ──────────────────────────
  if (phase === "saved") {
    return (
      <div className="space-y-4 pb-8">
        {hiddenInput}
        {transferPrompt && <TransferPrompt prompt={transferPrompt} onPick={linkTransfer} />}
        <div className="card glow wf-rise relative p-5 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--mint-glow)]">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-[var(--mint)]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
          </div>
          <div className="font-display text-lg font-semibold">Saved · {savedCount} transaction{savedCount === 1 ? "" : "s"}</div>
          <div className="mt-1 text-sm text-[var(--fg-mut)]">Balances updated.</div>
          {payoff && (
            <div className="mx-auto mt-4 inline-flex items-center gap-4 rounded-xl bg-[var(--bg-soft)] px-4 py-2.5">
              <span className="text-left">
                <span className="block text-[10px] uppercase tracking-[0.1em] text-[var(--fg-mut)]">Net worth</span>
                <span className="readout block text-[15px] font-medium text-[var(--mint)]">{dollars(payoff.netWorthUsd)}</span>
              </span>
              <span className="h-7 w-px bg-[var(--line)]" />
              <span className="text-left">
                <span className="block text-[10px] uppercase tracking-[0.1em] text-[var(--fg-mut)]">Burn / mo</span>
                <span className="readout block text-[15px] font-medium text-[var(--coral)]">{dollars(payoff.monthlyBurnUsd)}</span>
              </span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <button className={buttonPrimary()} onClick={() => { reset(); setTimeout(() => fileRef.current?.click(), 50); }}>Add another</button>
          <button className={buttonGhost()} onClick={() => { reset(); router.push("/money"); }}>See the numbers →</button>
        </div>
      </div>
    );
  }

  // ── MANUAL — type a transaction in (no screenshot) ─────────────────────────
  if (phase === "manual") {
    return (
      <div className="space-y-4 pb-8">
        {hiddenInput}
        <div className="wf-rise flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Add a transaction</h2>
          <button className="text-[12px] text-[var(--fg-mut)] underline-offset-2 hover:underline" onClick={reset}>← back</button>
        </div>
        <ManualForm
          onSaved={() => { setPhase("saved"); setSavedCount(1); router.refresh(); }}
          onError={setError}
        />
        {error && <ErrorBanner>{error}</ErrorBanner>}
      </div>
    );
  }

  // ── UPLOADING — calm scanning state ────────────────────────────────────────
  if (phase === "uploading") {
    return (
      <div className="space-y-4">
        <div className="card wf-rise relative overflow-hidden p-5">
          <div className="flex items-center gap-4">
            <div className="wf-scan relative h-20 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-[var(--bg-soft)]">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="h-full w-full object-cover opacity-70" />
              ) : (
                <div className="grid h-full w-full place-items-center text-[var(--fg-faint)]">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /></svg>
                </div>
              )}
            </div>
            <div>
              <div className="font-display text-base font-semibold">Reading your receipt…</div>
              <div className="mt-1 flex items-center gap-2 text-sm text-[var(--fg-mut)]">
                <span className="wf-pulse h-1.5 w-1.5 rounded-full bg-[var(--mint)]" />
                Extracting amount, merchant, reference id…
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── REVIEW — always-editable, pre-filled cards ─────────────────────────────
  if (phase === "review" && extract) {
    return (
      <div className="space-y-4 pb-8">
        {hiddenInput}
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {transferPrompt && <TransferPrompt prompt={transferPrompt} onPick={linkTransfer} />}

        <div className="card wf-rise space-y-3 p-4">
          <label className="block text-[11px] uppercase tracking-[0.1em] text-[var(--fg-mut)]">
            Account {extract.detectedInstitution ? <span className="text-[var(--mint)] normal-case tracking-normal">· detected {extract.detectedInstitution}</span> : ""}
          </label>
          <select
            className="w-full truncate px-3 py-2.5 text-sm"
            value={newAccount ? "__new__" : accountId}
            onChange={(e) => {
              if (e.target.value === "__new__") {
                const ccy = drafts[0]?.currency?.toUpperCase() || "PKR";
                setNewAccount({ name: extract.detectedInstitution ?? "", type: "fintech", currency: ccy });
              } else {
                setNewAccount(null);
                setAccountId(e.target.value);
              }
            }}
          >
            {accounts.length === 0 && <option value="">— no accounts yet —</option>}
            {accounts.length > 0 && <option value="">— choose —</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.currency}){a.institution ? ` · ${a.institution}` : ""}</option>
            ))}
            <option value="__new__">+ New account…</option>
          </select>

          {newAccount && (
            <div className="space-y-2.5 rounded-xl border border-dashed border-line bg-[var(--bg-soft)] p-3">
              <div className="text-[11px] uppercase tracking-[0.1em] text-[var(--fg-mut)]">New account</div>
              <input
                className="w-full px-3 py-2.5 text-sm"
                value={newAccount.name}
                onChange={(e) => setNewAccount((n) => (n ? { ...n, name: e.target.value } : n))}
                placeholder="Account name (e.g. ElevatePay)"
              />
              <div className="grid grid-cols-2 gap-2.5">
                <select className="w-full px-3 py-2.5 text-sm" value={newAccount.type} onChange={(e) => setNewAccount((n) => (n ? { ...n, type: e.target.value } : n))}>
                  {ACCOUNT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select className="w-full px-3 py-2.5 text-sm" value={newAccount.currency} onChange={(e) => setNewAccount((n) => (n ? { ...n, currency: e.target.value } : n))}>
                  {COMMON_CURRENCIES.includes(newAccount.currency) ? null : <option value={newAccount.currency}>{newAccount.currency}</option>}
                  {COMMON_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button className={buttonPrimary("!px-4 !py-2 !text-[13px]")} disabled={creatingAccount} onClick={createAccount}>
                  {creatingAccount ? "Creating…" : "Create & use"}
                </button>
                {accounts.length > 0 && (
                  <button className={buttonGhost("!px-3 !py-2 !text-[13px]")} onClick={() => setNewAccount(null)}>Cancel</button>
                )}
              </div>
            </div>
          )}
        </div>

        {drafts.length === 0 && <div className="text-sm text-[var(--fg-mut)]">All transactions handled.</div>}

        {drafts.map((t, i) => (
          <div key={i} className="card wf-rise space-y-3 p-4" style={{ animationDelay: `${i * 60}ms` }}>
            {t.duplicateOf && (
              <div className="rounded-lg bg-[rgba(245,185,66,0.12)] px-3 py-2 text-[12px] text-[var(--amber)]">
                Looks like a duplicate of an existing transaction — saving is blocked unless you change the reference id.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Amount">
                <input className="readout w-full px-3 py-2.5 text-right text-[15px]" inputMode="decimal" value={t.amount} onChange={(e) => patchDraft(i, { amount: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Currency">
                <input className="readout w-full px-3 py-2.5 uppercase" value={t.currency} onChange={(e) => patchDraft(i, { currency: e.target.value.toUpperCase() })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Direction">
                <div className="flex gap-1.5">
                  <SegBtn active={t.direction === "out"} onClick={() => patchDraft(i, { direction: "out" })} tone="coral" disabled={t.txnType === "transfer" || t.txnType === "investment"}>Out</SegBtn>
                  <SegBtn active={t.direction === "in"} onClick={() => patchDraft(i, { direction: "in" })} tone="mint" disabled={t.txnType === "transfer" || t.txnType === "investment"}>In</SegBtn>
                </div>
              </Field>
              <Field label="Type">
                <select
                  className="w-full px-3 py-2.5 text-sm"
                  value={t.txnType}
                  onChange={(e) => {
                    const next = e.target.value as (typeof drafts)[number]["txnType"];
                    // transfer/investment is always recorded as the OUT leg on the source side.
                    patchDraft(i, { txnType: next, ...(next === "transfer" || next === "investment" ? { direction: "out" } : {}) });
                  }}
                >
                  {TXN_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
            </div>
            {(t.txnType === "transfer" || t.txnType === "investment") && (
              <Field label={`To account · where the ${t.txnType === "investment" ? "investment" : "money"} lands`}>
                <select
                  className="w-full truncate px-3 py-2.5 text-sm"
                  value={t.destAccountId ?? ""}
                  onChange={(e) => patchDraft(i, { destAccountId: e.target.value || null })}
                >
                  <option value="">— choose destination —</option>
                  {accounts.filter((a) => a.id !== accountId).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency}){a.institution ? ` · ${a.institution}` : ""}</option>
                  ))}
                </select>
                {accounts.filter((a) => a.id !== accountId).length === 0 && (
                  <p className="mt-1 text-[11px] text-[var(--amber)]">
                    No other accounts yet. <a href="/money/accounts" className="underline">Add one</a> (the {t.txnType === "investment" ? "broker / exchange" : "destination"}), then come back.
                  </p>
                )}
              </Field>
            )}
            <Field label="Counterparty">
              <input className="w-full px-3 py-2.5 text-sm" value={t.counterparty ?? ""} onChange={(e) => patchDraft(i, { counterparty: e.target.value || null })} placeholder="merchant / sender / receiver" />
            </Field>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Field label="Category">
                <input className="w-full px-3 py-2.5 text-sm" value={t.category ?? ""} onChange={(e) => patchDraft(i, { category: e.target.value || null })} placeholder="e.g. groceries" />
              </Field>
              <Field label={t.externalId ? "Reference id" : "Reference id · not found, type it"}>
                <input
                  className={"readout w-full px-3 py-2.5 text-sm " + (t.externalId ? "" : "border-[var(--amber-dim)] bg-[rgba(245,185,66,0.06)]")}
                  value={t.externalId ?? ""}
                  onChange={(e) => patchDraft(i, { externalId: e.target.value || null })}
                  placeholder="transaction ref / TID"
                />
              </Field>
            </div>
            <Field label="Date / time">
              <input type="datetime-local" className="w-full px-3 py-2.5 text-sm" value={t.occurredLocal} onChange={(e) => patchDraft(i, { occurredLocal: e.target.value })} />
            </Field>
            <div className="flex items-center justify-end gap-2 pt-1">
              <span className="readout mr-auto text-[11px] text-[var(--fg-faint)]">{Math.round(t.confidence * 100)}% sure</span>
              <button className={buttonGhost("!px-3 !py-2 !text-[13px]")} onClick={() => setDrafts((d) => d.filter((_, idx) => idx !== i))}>Skip</button>
              <button className={buttonPrimary("!px-5 !py-2 !text-[13px]")} onClick={() => saveOne(i)}>Save</button>
            </div>
          </div>
        ))}

        {extract.notes && <p className="text-[11px] text-[var(--fg-faint)]">Note from extractor: {extract.notes}</p>}
        {drafts.length === 0 && <button className={buttonPrimary("w-full")} onClick={() => setPhase("saved")}>Done</button>}
        <button className="text-[12px] text-[var(--fg-faint)] underline" onClick={reset}>Cancel</button>
      </div>
    );
  }

  // ── IDLE — the home/capture screen ─────────────────────────────────────────
  return (
    <div className="space-y-4 pb-8">
      {hiddenInput}
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* hero capture card */}
      <button
        onClick={() => fileRef.current?.click()}
        className="card glow wf-rise group relative flex w-full flex-col items-center gap-3 overflow-hidden p-8 text-center transition hover:bg-[var(--card-hi)]"
      >
        <span className="absolute inset-x-0 -top-24 mx-auto h-48 w-48 rounded-full bg-[var(--mint-glow)] blur-3xl" />
        <span className="relative grid h-16 w-16 place-items-center rounded-2xl bg-[var(--mint-glow)] transition group-hover:scale-105">
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-[var(--mint)]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9a2 2 0 0 1 2-2h2l1.2-1.6A2 2 0 0 1 11 4.6h2a2 2 0 0 1 1.6.8L16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
        </span>
        <span className="relative">
          <span className="font-display block text-lg font-semibold">Add a transaction</span>
          <span className="mt-0.5 block text-sm text-[var(--fg-mut)]">Snap or pick a receipt — bank app, JazzCash, Payoneer, Binance…</span>
        </span>
        <span className="relative mt-1 inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-soft)] px-3 py-1 text-[12px] text-[var(--fg-dim)]">
          <span className="wf-pulse h-1.5 w-1.5 rounded-full bg-[var(--mint)]" />
          Reads the receipt for you · ~3s
        </span>
      </button>

      {/* enter manually — for cash, transfers, anything without a receipt */}
      <button
        onClick={() => { setError(null); setPhase("manual"); }}
        className="wf-rise w-full rounded-2xl border border-line bg-[var(--bg-soft)] px-4 py-3 text-sm text-[var(--fg-dim)] transition hover:bg-[var(--card-hi)] hover:text-[var(--fg)]"
        style={{ animationDelay: "60ms" }}
      >
        …or <span className="text-[var(--fg)]">enter a transaction manually</span> (cash, transfers, no receipt)
      </button>

      {/* this-week strip — calm, non-guilting */}
      <div className="wf-rise flex items-center justify-between rounded-2xl border border-line bg-[var(--bg-soft)] px-4 py-3" style={{ animationDelay: "80ms" }}>
        <div className="text-sm text-[var(--fg-dim)]">
          <span className="readout text-[var(--fg)]">{props.thisWeek}</span> transaction{props.thisWeek === 1 ? "" : "s"} this week
        </div>
        <Link href="/money" className="text-[12px] text-[var(--fg-mut)] underline-offset-2 hover:underline">
          {props.netWorthUsd !== null ? `net worth ${dollars(props.netWorthUsd)} →` : "see the numbers →"}
        </Link>
      </div>

      {!props.hasAccounts && (
        <div className="wf-rise rounded-2xl border border-dashed border-line p-4 text-sm text-[var(--fg-mut)]" style={{ animationDelay: "120ms" }}>
          First, map your financial reality —{" "}
          <Link href="/money/accounts" className="text-[var(--mint)] underline">add your accounts</Link> (banks, fintech, exchanges, wallets, cash).
        </div>
      )}

    </div>
  );
}

// ── small bits ───────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--fg-mut)]">{label}</span>
      {children}
    </label>
  );
}
function SegBtn({ active, onClick, children, tone, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; tone: "mint" | "coral"; disabled?: boolean }) {
  const onCls = tone === "mint" ? "bg-[var(--mint-glow)] text-[var(--mint)] border-[var(--mint-dim)]" : "bg-[rgba(255,107,107,0.12)] text-[var(--coral)] border-[var(--coral-dim)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={"flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition " + (active ? onCls : "border-line text-[var(--fg-mut)] hover:text-[var(--fg-dim)]") + (disabled ? " opacity-60 cursor-not-allowed" : "")}
    >
      {children}
    </button>
  );
}
function ErrorBanner({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-[rgba(255,107,107,0.1)] px-3.5 py-2.5 text-[13px] text-[var(--coral)]">{children}</div>;
}
function TransferPrompt({ prompt, onPick }: { prompt: { savedTxnId: string; candidates: TransferCandidate[] }; onPick: (id: string | null) => void }) {
  return (
    <div className="card wf-rise space-y-2 border-[var(--cyan-dim)] p-4">
      <div className="text-sm font-medium text-[var(--cyan)]">Other half of a transfer between your accounts?</div>
      <ul className="space-y-1.5">
        {prompt.candidates.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 text-[13px] text-[var(--fg-dim)]">
            <span className="readout">
              {c.direction === "in" ? "+" : "−"}{c.currency} {Number(c.amount).toLocaleString()} {c.counterparty ? `· ${c.counterparty}` : ""} · {new Date(c.occurredAt).toLocaleDateString()}
            </span>
            <button className="rounded-lg bg-[var(--cyan-dim)] px-2.5 py-1 text-[12px] font-medium text-[#03161c]" onClick={() => onPick(c.id)}>Yes, link</button>
          </li>
        ))}
      </ul>
      <button className="text-[12px] text-[var(--fg-faint)] underline" onClick={() => onPick(null)}>No, none of these</button>
    </div>
  );
}

// ── manual transaction form (no screenshot) ──────────────────────────────────
function ManualForm({ onSaved, onError }: { onSaved: () => void; onError: (m: string | null) => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const presetAccountId = params.get("accountId") || "";

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountId, setAccountId] = useState(presetAccountId);
  const [newAccount, setNewAccount] = useState<{ name: string; type: string; currency: string } | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);

  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [txnType, setTxnType] = useState<(typeof TXN_TYPES)[number][0]>("expense");
  const [destAccountId, setDestAccountId] = useState<string>(""); // only used for transfer/investment
  const [counterparty, setCounterparty] = useState("");
  const [category, setCategory] = useState("");
  const [externalId, setExternalId] = useState("");
  const [occurredLocal, setOccurredLocal] = useState(isoLocal(new Date()));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [transferPrompt, setTransferPrompt] = useState<{ savedTxnId: string; candidates: TransferCandidate[] } | null>(null);

  const selectedAccount = accounts.find((a) => a.id === accountId);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/accounts");
        const data = await res.json();
        const active = ((data.accounts ?? []) as (Account & { archived?: string | null })[]).filter((a) => !a.archived);
        setAccounts(active.map((a) => ({ id: a.id, name: a.name, currency: a.currency, institution: a.institution })));
        if (!presetAccountId && active[0]) setAccountId(active[0].id);
      } catch {
        onError("Couldn't load your accounts.");
      } finally {
        setLoadingAccounts(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createAccount() {
    if (!newAccount || !newAccount.name.trim()) { onError("Give the account a name."); return; }
    setCreatingAccount(true);
    onError(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newAccount.name.trim(), type: newAccount.type, currency: newAccount.currency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create the account");
      const acc = data.account as { id: string; name: string; currency: string; institution: string | null };
      setAccounts((a) => [...a, { id: acc.id, name: acc.name, currency: acc.currency, institution: acc.institution }]);
      setAccountId(acc.id);
      setNewAccount(null);
      router.refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't create the account");
    } finally {
      setCreatingAccount(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    if (!accountId) { onError(newAccount ? 'Tap "Create & use" to add the account first.' : "Pick an account."); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { onError("Enter an amount greater than 0."); return; }
    const when = new Date(occurredLocal);
    if (Number.isNaN(when.getTime())) { onError("Pick a valid date/time."); return; }
    const twoLegged = txnType === "transfer" || txnType === "investment";
    if (twoLegged) {
      if (!destAccountId) { onError(`Pick the destination account for this ${txnType}.`); return; }
      if (destAccountId === accountId) { onError("Source and destination must be different accounts."); return; }
    }
    setBusy(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          destAccountId: twoLegged ? destAccountId : null,
          externalId: externalId.trim() || null,
          amount: String(amt),
          currency: (selectedAccount?.currency || "PKR").toUpperCase(),
          direction: twoLegged ? "out" : direction,
          txnType,
          counterparty: counterparty.trim() || null,
          category: category.trim() || null,
          occurredAt: when.toISOString(),
          notes: notes.trim() || null,
        }),
      });
      const data = (await res.json()) as SaveResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (Array.isArray(data.transferCandidates) && data.transferCandidates.length > 0) {
        setTransferPrompt({ savedTxnId: data.transaction.id, candidates: data.transferCandidates });
        return; // let them resolve the transfer prompt; we'll finish after
      }
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function resolveTransfer(otherId: string | null) {
    if (transferPrompt && otherId) {
      await fetch("/api/transactions/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txnIdA: transferPrompt.savedTxnId, txnIdB: otherId }),
      });
    }
    setTransferPrompt(null);
    onSaved();
  }

  if (transferPrompt) {
    return <TransferPrompt prompt={transferPrompt} onPick={resolveTransfer} />;
  }

  return (
    <form className="card wf-rise space-y-3 p-4" onSubmit={submit}>
      {/* account */}
      <Field label="Account">
        {loadingAccounts ? (
          <div className="h-10 animate-pulse rounded-lg bg-[var(--bg-soft)]" />
        ) : (
          <select
            className="w-full truncate px-3 py-2.5 text-sm"
            value={newAccount ? "__new__" : accountId}
            onChange={(e) => {
              if (e.target.value === "__new__") setNewAccount({ name: "", type: "fintech", currency: "PKR" });
              else { setNewAccount(null); setAccountId(e.target.value); }
            }}
          >
            {accounts.length === 0 && <option value="">— no accounts yet —</option>}
            {accounts.length > 0 && <option value="">— choose —</option>}
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency}){a.institution ? ` · ${a.institution}` : ""}</option>)}
            <option value="__new__">+ New account…</option>
          </select>
        )}
      </Field>

      {newAccount && (
        <div className="space-y-2.5 rounded-xl border border-dashed border-line bg-[var(--bg-soft)] p-3">
          <div className="text-[11px] uppercase tracking-[0.1em] text-[var(--fg-mut)]">New account</div>
          <input className="w-full px-3 py-2.5 text-sm" value={newAccount.name} onChange={(e) => setNewAccount((n) => (n ? { ...n, name: e.target.value } : n))} placeholder="Account name" />
          <div className="grid grid-cols-2 gap-2.5">
            <select className="w-full px-3 py-2.5 text-sm" value={newAccount.type} onChange={(e) => setNewAccount((n) => (n ? { ...n, type: e.target.value } : n))}>
              {ACCOUNT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className="w-full px-3 py-2.5 text-sm" value={newAccount.currency} onChange={(e) => setNewAccount((n) => (n ? { ...n, currency: e.target.value } : n))}>
              {COMMON_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={buttonPrimary("!px-4 !py-2 !text-[13px]")} disabled={creatingAccount} onClick={createAccount}>{creatingAccount ? "Creating…" : "Create & use"}</button>
            {accounts.length > 0 && <button type="button" className={buttonGhost("!px-3 !py-2 !text-[13px]")} onClick={() => setNewAccount(null)}>Cancel</button>}
          </div>
        </div>
      )}

      {/* amount + direction */}
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={`Amount${selectedAccount ? ` (${selectedAccount.currency})` : ""}`}>
          <input className="readout w-full px-3 py-2.5 text-right text-[15px]" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Direction">
          <div className="flex gap-1.5">
            <SegBtn active={direction === "out"} onClick={() => setDirection("out")} tone="coral" disabled={txnType === "transfer" || txnType === "investment"}>Out</SegBtn>
            <SegBtn active={direction === "in"} onClick={() => setDirection("in")} tone="mint" disabled={txnType === "transfer" || txnType === "investment"}>In</SegBtn>
          </div>
        </Field>
      </div>

      {/* type + date */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Field label="Type">
          <select
            className="w-full px-3 py-2.5 text-sm"
            value={txnType}
            onChange={(e) => {
              const next = e.target.value as typeof txnType;
              setTxnType(next);
              if (next === "transfer" || next === "investment") setDirection("out"); // two-legged is always recorded out from source
            }}
          >
            {TXN_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Date / time">
          <input type="datetime-local" className="w-full px-3 py-2.5 text-sm" value={occurredLocal} onChange={(e) => setOccurredLocal(e.target.value)} />
        </Field>
      </div>

      {(txnType === "transfer" || txnType === "investment") && (
        <Field label={`To account · where the ${txnType === "investment" ? "investment" : "money"} lands`}>
          <select className="w-full truncate px-3 py-2.5 text-sm" value={destAccountId} onChange={(e) => setDestAccountId(e.target.value)}>
            <option value="">— choose destination —</option>
            {accounts.filter((a) => a.id !== accountId).map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.currency}){a.institution ? ` · ${a.institution}` : ""}</option>
            ))}
          </select>
          {accounts.filter((a) => a.id !== accountId).length === 0 && (
            <p className="mt-1 text-[11px] text-[var(--amber)]">
              No other accounts yet. <a href="/money/accounts" className="underline">Add one</a> (the {txnType === "investment" ? "broker / exchange" : "destination"}) first.
            </p>
          )}
        </Field>
      )}

      <Field label="Counterparty (optional)">
        <input className="w-full px-3 py-2.5 text-sm" placeholder="merchant / sender / receiver" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Field label="Category (optional)">
          <input className="w-full px-3 py-2.5 text-sm" placeholder="e.g. groceries" value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <Field label="Reference id (optional)">
          <input className="readout w-full px-3 py-2.5 text-sm" placeholder="bank/fintech ref — helps dedup" value={externalId} onChange={(e) => setExternalId(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes (optional)">
        <input className="w-full px-3 py-2.5 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <p className="text-[11px] text-[var(--fg-faint)]">
        Tip: this updates the account&apos;s balance. For a one-off correction (not a real transaction), edit the account&apos;s balance on the <Link href="/money/accounts" className="underline">Accounts</Link> screen instead.
      </p>
      <button type="submit" disabled={busy} className={buttonPrimary("w-full")}>{busy ? "Saving…" : "Save transaction"}</button>
    </form>
  );
}
