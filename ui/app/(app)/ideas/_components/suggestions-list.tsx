"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, ConfChip, buttonGhost, buttonPrimary } from "../../_components/ui";

export type ClientRec = {
  id: string;
  title: string;
  body: string;
  reasoning: string;
  grounding: Record<string, unknown>;
  status: "new" | "acted" | "dismissed" | "snoozed";
  createdAt: string;
};

const STATUS_LABEL: Record<ClientRec["status"], string> = { new: "New", acted: "Acted", dismissed: "Dismissed", snoozed: "Snoozed" };

export function SuggestionsList({ initial }: { initial: ClientRec[] }) {
  const router = useRouter();
  const [recs, setRecs] = useState(initial);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: ClientRec["status"]) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/recommendations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Update failed");
      }
      setRecs((r) => r.map((x) => (x.id === id ? { ...x, status } : x)));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }
  function toggle(id: string) {
    setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const active = recs.filter((r) => r.status === "new");
  const handled = recs.filter((r) => r.status !== "new");
  const confOf = (r: ClientRec) => (typeof r.grounding?.confidence === "string" ? (r.grounding.confidence as string) : null);

  if (recs.length === 0) {
    return (
      <Card className="wf-rise p-6 text-[13px] text-[var(--fg-mut)]">
        No ideas yet. They&apos;re generated weekly — the <code className="text-[var(--fg-dim)]">cron/weekly-suggestions</code> task assembles your snapshot and asks the strategist. Works best once you have accounts, FX rates, and a few transactions in.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl bg-[rgba(255,107,107,0.1)] px-3.5 py-2.5 text-[13px] text-[var(--coral)]">{error}</div>}
      {active.length === 0 && <div className="text-[13px] text-[var(--fg-mut)]">No new ideas right now.</div>}

      <ul className="space-y-3">
        {active.map((r, idx) => {
          const conf = confOf(r);
          const isOpen = open.has(r.id);
          const impact = typeof r.grounding?.estimatedImpact === "string" ? (r.grounding.estimatedImpact as string) : null;
          return (
            <li key={r.id}>
              <Card glow className="wf-rise p-4" style={{ animationDelay: `${idx * 50}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-[15px] font-semibold leading-snug text-[var(--fg)]">{r.title}</h3>
                  {conf && <span className="shrink-0"><ConfChip level={conf} /></span>}
                </div>
                <p className="mt-1.5 text-[13px] text-[var(--fg-dim)]">{r.body}</p>
                {impact && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[var(--mint-glow)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--mint)]">
                    <span className="text-[10px]">▲</span> {impact}
                  </div>
                )}

                <button className="mt-2.5 text-[12px] text-[var(--fg-mut)] underline-offset-2 hover:underline" onClick={() => toggle(r.id)}>
                  {isOpen ? "Hide reasoning" : "Why this? — reasoning & grounding"}
                </button>
                {isOpen && (
                  <div className="mt-2 space-y-2.5 rounded-xl bg-[var(--bg-soft)] p-3.5 text-[12px] text-[var(--fg-dim)]">
                    <div>
                      <div className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--fg-mut)]">Reasoning</div>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed">{r.reasoning}</p>
                    </div>
                    <div>
                      <div className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--fg-mut)]">Grounded in</div>
                      <Grounding g={r.grounding} />
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button disabled={busyId === r.id} className={buttonPrimary("!px-3.5 !py-2 !text-[13px]")} onClick={() => setStatus(r.id, "acted")}>I acted on this</button>
                  <button disabled={busyId === r.id} className={buttonGhost("!px-3.5 !py-2 !text-[13px]")} onClick={() => setStatus(r.id, "snoozed")}>Snooze</button>
                  <button disabled={busyId === r.id} className="rounded-xl px-3 py-2 text-[13px] text-[var(--fg-faint)] transition hover:text-[var(--fg-mut)] disabled:opacity-50" onClick={() => setStatus(r.id, "dismissed")}>Dismiss</button>
                </div>
                <div className="mt-2 text-[10.5px] text-[var(--fg-faint)]">{new Date(r.createdAt).toLocaleDateString()}</div>
              </Card>
            </li>
          );
        })}
      </ul>

      {handled.length > 0 && (
        <details className="text-[13px] text-[var(--fg-mut)]">
          <summary className="cursor-pointer select-none">Handled · {handled.length}</summary>
          <ul className="mt-2 space-y-1.5">
            {handled.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-[var(--card)] px-3.5 py-2.5">
                <span className="truncate text-[var(--fg-dim)]">{r.title}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[10.5px] text-[var(--fg-mut)]">{STATUS_LABEL[r.status]}</span>
                  <button className="text-[10.5px] text-[var(--fg-mut)] underline" onClick={() => setStatus(r.id, "new")}>reopen</button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Grounding({ g }: { g: Record<string, unknown> }) {
  const metrics = Array.isArray(g.metrics) ? (g.metrics as string[]) : [];
  const newsIds = Array.isArray(g.newsItemIds) ? (g.newsItemIds as string[]) : [];
  const acctIds = Array.isArray(g.accountIds) ? (g.accountIds as string[]) : [];
  const empty = metrics.length === 0 && newsIds.length === 0 && acctIds.length === 0;
  return (
    <ul className="mt-1 space-y-1">
      {metrics.map((m, i) => (
        <li key={`m${i}`} className="flex items-start gap-1.5"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--mint)]" />{m}</li>
      ))}
      {newsIds.length > 0 && <li className="flex items-start gap-1.5"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--amber)]" />{newsIds.length} news item{newsIds.length === 1 ? "" : "s"}</li>}
      {acctIds.length > 0 && <li className="flex items-start gap-1.5"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--cyan)]" />{acctIds.length} account{acctIds.length === 1 ? "" : "s"}</li>}
      {empty && <li className="text-[var(--fg-faint)]">(nothing specific cited)</li>}
    </ul>
  );
}
