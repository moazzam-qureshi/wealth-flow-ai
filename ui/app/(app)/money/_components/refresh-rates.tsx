"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Small inline button: fetch FX rates now (calls /api/cron/fx-rates), then refresh
// the page so the dashboard re-renders with the new rates. The dashboard already
// auto-fetches on load if rates are missing/stale, so this is mostly for "the
// numbers look off, pull fresh rates" — but it also rescues you if auto-fetch
// failed (e.g. the source was briefly down).
export function RefreshRatesButton({ label = "Fetch FX rates now", className = "" }: { label?: string; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cron/fx-rates");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMsg("Rates updated.");
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(e instanceof Error ? `Couldn't fetch: ${e.message}` : "Couldn't fetch rates.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={"inline-flex items-center gap-2 " + className}>
      <button
        onClick={run}
        disabled={busy || pending}
        className="rounded-md bg-[rgba(245,185,66,0.2)] px-2.5 py-1 text-[11px] font-medium text-[var(--amber)] transition hover:brightness-110 disabled:opacity-50"
      >
        {busy || pending ? "Fetching…" : label}
      </button>
      {msg && <span className="text-[11px] text-[var(--fg-mut)]">{msg}</span>}
    </span>
  );
}
