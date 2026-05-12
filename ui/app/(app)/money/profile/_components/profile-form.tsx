"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, SectionLabel, buttonGhost, buttonPrimary } from "../../../_components/ui";

type Tri = "yes" | "no" | "unknown";
type Graph = {
  usStockMarket: Tri;
  usStockMarketVia: string;
  localStockMarket: Tri;
  holdsForeignCurrency: Tri;
  holdsStablecoins: Tri;
  movesMoneyInternationally: Tri;
  receivesCrossBorderIncome: Tri;
  retirementAccounts: Tri;
  paymentRails: string[];
  notes: string;
};
type Initial = { geography: string; displayCurrencyPref: string; homeCurrency: string; capabilityGraph: Graph };

const RAIL_LABEL: Record<string, string> = {
  local_bank_transfer: "Local bank transfer (Raast/IBFT)",
  payoneer: "Payoneer",
  wise: "Wise",
  paypal: "PayPal",
  crypto: "Crypto / stablecoins on-chain",
  binance_p2p: "Binance P2P",
  western_union: "Western Union",
  remittance_app: "Remittance app",
  credit_debit_card: "Credit / debit card",
};
// pretty-print a rail key for display (custom ones too): "binance_p2p" → "Binance P2P"
function railLabel(r: string) {
  return RAIL_LABEL[r] ?? r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function normalizeRail(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 60);
}

const CAP_QUESTIONS: { key: keyof Graph; label: string; hint?: string; withNote?: keyof Graph }[] = [
  { key: "usStockMarket", label: "Can invest in US / international stocks", hint: "e.g. via IBKR with a USD account", withNote: "usStockMarketVia" },
  { key: "localStockMarket", label: "Can invest in the local stock market", hint: "e.g. PSX" },
  { key: "holdsForeignCurrency", label: "Can hold foreign currency", hint: "USD / EUR / etc." },
  { key: "holdsStablecoins", label: "Can hold stablecoins", hint: "USDT / USDC" },
  { key: "movesMoneyInternationally", label: "Can move money internationally", hint: "in or out of the country" },
  { key: "receivesCrossBorderIncome", label: "Can receive cross-border income easily", hint: "freelance / business payments from abroad" },
  { key: "retirementAccounts", label: "Has access to retirement / tax-advantaged accounts" },
];

export function ProfileForm({ initial, commonRails }: { initial: Initial; commonRails: string[] }) {
  const router = useRouter();
  const [geography, setGeography] = useState(initial.geography);
  const [displayCcy, setDisplayCcy] = useState(initial.displayCurrencyPref);
  const [homeCcy, setHomeCcy] = useState(initial.homeCurrency);
  const [g, setG] = useState<Graph>(initial.capabilityGraph);
  const [customRail, setCustomRail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function addRail(name: string) {
    const r = normalizeRail(name);
    if (!r) return;
    setG((x) => (x.paymentRails.includes(r) ? x : { ...x, paymentRails: [...x.paymentRails, r] }));
    setSaved(false);
  }
  function removeRail(r: string) {
    setG((x) => ({ ...x, paymentRails: x.paymentRails.filter((y) => y !== r) }));
    setSaved(false);
  }

  function setTri(key: keyof Graph, v: Tri) {
    setG((x) => ({ ...x, [key]: v }));
    setSaved(false);
  }
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ geography, displayCurrencyPref: displayCcy, homeCurrency: homeCcy, capabilityGraph: g }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Save failed");
      }
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl bg-[rgba(255,107,107,0.1)] px-3.5 py-2.5 text-[13px] text-[var(--coral)]">{error}</div>}

      {/* basics */}
      <Card className="wf-rise space-y-3 p-4">
        <SectionLabel>Basics</SectionLabel>
        <Field label="Where you're based">
          <input className="w-full px-3 py-2.5 text-sm" placeholder="e.g. Pakistan" value={geography} onChange={(e) => { setGeography(e.target.value); setSaved(false); }} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Display currency"><input list="ccy" className="readout w-full px-3 py-2.5 text-sm uppercase" value={displayCcy} onChange={(e) => { setDisplayCcy(e.target.value.toUpperCase()); setSaved(false); }} /></Field>
          <Field label="Home currency"><input list="ccy" className="readout w-full px-3 py-2.5 text-sm uppercase" value={homeCcy} onChange={(e) => { setHomeCcy(e.target.value.toUpperCase()); setSaved(false); }} /></Field>
          <datalist id="ccy">{["USD", "PKR", "EUR", "GBP", "AED"].map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      </Card>

      {/* capability graph */}
      <Card className="wf-rise space-y-1 p-4" style={{ animationDelay: "60ms" }}>
        <SectionLabel>What you can do</SectionLabel>
        <p className="mb-2 text-[12px] text-[var(--fg-mut)]">Mark each honestly. &quot;Not sure&quot; tells the strategist to ask rather than assume.</p>
        <div className="divide-y divide-[var(--line-soft)]">
          {CAP_QUESTIONS.map((q) => (
            <div key={q.key as string} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13.5px] text-[var(--fg-dim)]">{q.label}</div>
                  {q.hint && <div className="mt-0.5 text-[11px] text-[var(--fg-faint)]">{q.hint}</div>}
                </div>
                <TriToggle value={g[q.key] as Tri} onChange={(v) => setTri(q.key, v)} />
              </div>
              {q.withNote && (g[q.key] as Tri) === "yes" && (
                <input
                  className="mt-2 w-full px-3 py-2 text-[13px]"
                  placeholder="how? (e.g. IBKR via USD account)"
                  value={(g[q.withNote] as string) ?? ""}
                  onChange={(e) => { setG((x) => ({ ...x, [q.withNote as string]: e.target.value })); setSaved(false); }}
                />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* payment rails — selected (incl. custom), plus common quick-picks, plus add-your-own */}
      <Card className="wf-rise space-y-3 p-4" style={{ animationDelay: "100ms" }}>
        <SectionLabel>Payment rails you use</SectionLabel>

        {/* selected — removable chips (covers custom ones too) */}
        {g.paymentRails.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {g.paymentRails.map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--mint-dim)] bg-[var(--mint-glow)] px-3 py-1.5 text-[12px] text-[var(--mint)]">
                {railLabel(r)}
                <button type="button" aria-label={`Remove ${railLabel(r)}`} className="grid h-3.5 w-3.5 place-items-center rounded-full text-[var(--mint)]/70 hover:bg-[var(--mint)]/20 hover:text-[var(--mint)]" onClick={() => removeRail(r)}>×</button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-[var(--fg-faint)]">None added yet.</p>
        )}

        {/* common quick-picks not already selected */}
        {(() => {
          const remaining = commonRails.filter((r) => !g.paymentRails.includes(r));
          if (remaining.length === 0) return null;
          return (
            <div>
              <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.1em] text-[var(--fg-mut)]">Common — tap to add</div>
              <div className="flex flex-wrap gap-2">
                {remaining.map((r) => (
                  <button key={r} type="button" onClick={() => addRail(r)} className="rounded-full border border-line px-3 py-1.5 text-[12px] text-[var(--fg-mut)] transition hover:border-[var(--mint-dim)] hover:text-[var(--mint)]">
                    + {railLabel(r)}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* add your own */}
        <div>
          <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.1em] text-[var(--fg-mut)]">Add your own</div>
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 text-[13px]"
              placeholder="e.g. SadaPay, NayaPay, Easypaisa, …"
              value={customRail}
              onChange={(e) => setCustomRail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRail(customRail); setCustomRail(""); } }}
            />
            <button type="button" className={buttonGhost("!px-3.5 !py-2 !text-[13px]")} onClick={() => { addRail(customRail); setCustomRail(""); }} disabled={!customRail.trim()}>Add</button>
          </div>
        </div>
      </Card>

      {/* notes */}
      <Card className="wf-rise space-y-2 p-4" style={{ animationDelay: "140ms" }}>
        <SectionLabel>Anything else</SectionLabel>
        <textarea
          className="min-h-20 w-full px-3 py-2.5 text-[13px]"
          placeholder="Other constraints or access worth knowing (visa status affecting banking, capital controls you've hit, accounts in other countries, etc.)"
          value={g.notes}
          onChange={(e) => { setG((x) => ({ ...x, notes: e.target.value })); setSaved(false); }}
        />
      </Card>

      <div className="flex items-center gap-3">
        <button disabled={busy} className={buttonPrimary("flex-1")} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        {saved && <span className="text-[13px] text-[var(--mint)]">Saved ✓</span>}
      </div>
    </div>
  );
}

function TriToggle({ value, onChange }: { value: Tri; onChange: (v: Tri) => void }) {
  const opts: { v: Tri; label: string }[] = [
    { v: "yes", label: "Yes" },
    { v: "no", label: "No" },
    { v: "unknown", label: "Not sure" },
  ];
  return (
    <div className="flex shrink-0 gap-1 rounded-lg border border-line p-0.5">
      {opts.map((o) => {
        const on = value === o.v;
        const onCls = o.v === "yes" ? "bg-[var(--mint-glow)] text-[var(--mint)]" : o.v === "no" ? "bg-[rgba(255,107,107,0.12)] text-[var(--coral)]" : "bg-[var(--card-hi)] text-[var(--fg-dim)]";
        return (
          <button key={o.v} type="button" onClick={() => onChange(o.v)} className={"rounded-md px-2.5 py-1 text-[11px] font-medium transition " + (on ? onCls : "text-[var(--fg-faint)] hover:text-[var(--fg-mut)]")}>
            {o.label}
          </button>
        );
      })}
    </div>
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
