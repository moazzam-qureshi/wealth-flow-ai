import Link from "next/link";
import { requireUser } from "@/src/lib/session";
import { AppNav } from "./_components/app-nav";
import { SignOutButton } from "./_components/sign-out-button";

// Authenticated app shell. Every page in this route group requires a session
// (DB-verified — proxy.ts is only optimistic) and gets the bottom-tab nav (mobile)
// / left sidebar (desktop). Home tab `/` is the capture screen.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh md:pl-56">
      {/* slim top header — minimal; nav lives in the tab bar / sidebar */}
      <header className="sticky top-0 z-30 border-b border-line bg-[var(--bg)]/80 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-2.5">
          <span className="font-display text-[15px] font-semibold tracking-tight">WealthFlow</span>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--fg-mut)]">
            <Link href="/money/profile" className="rounded-md px-2 py-1 transition hover:bg-[var(--card)] hover:text-[var(--fg)]">Profile</Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* desktop header bar (right of sidebar) */}
      <header className="sticky top-0 z-30 hidden border-b border-line bg-[var(--bg)]/70 backdrop-blur-xl md:block">
        <div className="mx-auto flex max-w-2xl items-center justify-end gap-1.5 px-6 py-2.5 text-[11px] text-[var(--fg-mut)]">
          <span className="mr-2">{user.email}</span>
          <Link href="/money/profile" className="rounded-md px-2 py-1 transition hover:bg-[var(--card)] hover:text-[var(--fg)]">Profile</Link>
          <SignOutButton />
        </div>
      </header>

      <main className="pb-safe md:pb-12">{children}</main>

      <AppNav />
    </div>
  );
}
