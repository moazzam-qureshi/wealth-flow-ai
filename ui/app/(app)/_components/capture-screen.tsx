"use client";

import { useEffect, useRef, useState } from "react";
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

type Phase = "idle" | "uploading" | "review" | "saved";

export function CaptureScreen(props: {
  recentUploads: { id: string; status: string; uploadedAt: string }[];
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
  const [drafts, setDrafts] = useState<(ReviewTxn & { occurredLocal: string })[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [payoff, setPayoff] = useState<{ netWorthUsd: number | null; monthlyBurnUsd: number | null } | null>(null);
  const [transferPrompt, setTransferPrompt] = useState<{ savedTxnId: string; candidates: TransferCandidate[] } | null>(null);

  // arrived from the Web Share Target → ?uploadId=… ; process it on mount
  const sharedUploadId = params.get("uploadId");
  useEffect(() => {
    if (!sharedUploadId || extract) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedUploadId]);

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
    setDrafts(r.transactions.map((t) => ({ ...t, occurredLocal: t.occurredAt ? isoLocal(new Date(t.occurredAt)) : isoLocal(new Date()) })));
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
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          uploadId: extract?.uploadId ?? null,
          externalId: t.externalId,
          amount: t.amount,
          currency: t.currency,
          direction: t.direction,
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
                  <SegBtn active={t.direction === "out"} onClick={() => patchDraft(i, { direction: "out" })} tone="coral">Out</SegBtn>
                  <SegBtn active={t.direction === "in"} onClick={() => patchDraft(i, { direction: "in" })} tone="mint">In</SegBtn>
                </div>
              </Field>
              <Field label="Type">
                <select className="w-full px-3 py-2.5 text-sm" value={t.txnType} onChange={(e) => patchDraft(i, { txnType: e.target.value as (typeof drafts)[number]["txnType"] })}>
                  {TXN_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
            </div>
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

      {/* this-week strip — calm, non-guilting */}
      <div className="wf-rise flex items-center justify-between rounded-2xl border border-line bg-[var(--bg-soft)] px-4 py-3" style={{ animationDelay: "80ms" }}>
        <div className="text-sm text-[var(--fg-dim)]">
          <span className="readout text-[var(--fg)]">{props.thisWeek}</span> transaction{props.thisWeek === 1 ? "" : "s"} this week
        </div>
        <a href="/money" className="text-[12px] text-[var(--fg-mut)] underline-offset-2 hover:underline">
          {props.netWorthUsd !== null ? `net worth ${dollars(props.netWorthUsd)} →` : "see the numbers →"}
        </a>
      </div>

      {!props.hasAccounts && (
        <div className="wf-rise rounded-2xl border border-dashed border-line p-4 text-sm text-[var(--fg-mut)]" style={{ animationDelay: "120ms" }}>
          First, map your financial reality —{" "}
          <a href="/money/accounts" className="text-[var(--mint)] underline">add your accounts</a> (banks, fintech, exchanges, wallets, cash).
        </div>
      )}

      {/* recent uploads */}
      {props.recentUploads.length > 0 && (
        <div className="wf-rise" style={{ animationDelay: "140ms" }}>
          <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-[var(--fg-mut)]">Recent uploads</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {props.recentUploads.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  setPhase("uploading");
                  setError(null);
                  fetch(`/api/uploads/${u.id}`)
                    .then((r) => r.json())
                    .then((d) => { if (d.error) throw new Error(d.error); enterReview(d as ExtractResponse); })
                    .catch((e) => { setError(e instanceof Error ? e.message : "Couldn't re-open"); setPhase("idle"); });
                }}
                className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-line bg-[var(--bg-soft)] text-[var(--fg-faint)] transition hover:border-[var(--mint-dim)] hover:text-[var(--mint)]"
                title={`Uploaded ${new Date(u.uploadedAt).toLocaleString()} · ${u.status}`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 16 5-5 4 4 3-3 6 6" /></svg>
              </button>
            ))}
          </div>
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
function SegBtn({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: React.ReactNode; tone: "mint" | "coral" }) {
  const onCls = tone === "mint" ? "bg-[var(--mint-glow)] text-[var(--mint)] border-[var(--mint-dim)]" : "bg-[rgba(255,107,107,0.12)] text-[var(--coral)] border-[var(--coral-dim)]";
  return (
    <button type="button" onClick={onClick} className={"flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition " + (active ? onCls : "border-line text-[var(--fg-mut)] hover:text-[var(--fg-dim)]")}>{children}</button>
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
