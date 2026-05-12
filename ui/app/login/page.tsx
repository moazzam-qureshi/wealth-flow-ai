"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signUp } from "@/src/lib/auth-client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        const res = await signUp.email({ email, password, name: name || email });
        if (res.error) throw new Error(res.error.message || "Sign up failed");
      } else {
        const res = await signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message || "Sign in failed");
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm wf-rise">
      <div className="mb-7 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--mint-glow)]">
          <span className="h-3 w-3 rounded-sm bg-[var(--mint)]" />
        </span>
        <span className="font-display text-lg font-semibold tracking-tight">WealthFlow</span>
      </div>
      <h1 className="font-display text-[22px] font-semibold">{mode === "signin" ? "Sign in" : "Create your account"}</h1>
      <p className="mt-1 text-[13px] text-[var(--fg-mut)]">Your financial reality, mapped — and what to do about it.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-2.5">
        {mode === "signup" && (
          <input className="w-full px-3.5 py-3 text-sm" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        )}
        <input type="email" required className="w-full px-3.5 py-3 text-sm" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <input type="password" required minLength={8} className="w-full px-3.5 py-3 text-sm" placeholder="Password (8+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        {error && <p className="text-[13px] text-[var(--coral)]">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-[var(--mint)] px-4 py-3 text-sm font-semibold text-[#04130d] transition hover:brightness-110 disabled:opacity-50">
          {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button type="button" className="mt-4 text-[13px] text-[var(--fg-mut)] underline-offset-2 hover:underline" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}>
        {mode === "signin" ? "Need an account? Create one" : "Have an account? Sign in"}
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <Suspense fallback={<div className="text-sm text-[var(--fg-faint)]">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
