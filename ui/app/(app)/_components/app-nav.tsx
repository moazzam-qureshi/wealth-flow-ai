"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The 5 destinations. `Add` (capture) is home. `Money` folds in accounts.
const TABS = [
  { href: "/", label: "Add", icon: IconCapture, match: (p: string) => p === "/" },
  { href: "/money", label: "Money", icon: IconMoney, match: (p: string) => p.startsWith("/money") },
  { href: "/news", label: "News", icon: IconNews, match: (p: string) => p.startsWith("/news") },
  { href: "/ideas", label: "Ideas", icon: IconIdeas, match: (p: string) => p.startsWith("/ideas") },
  { href: "/chat", label: "Chat", icon: IconChat, match: (p: string) => p.startsWith("/chat") },
] as const;

export function AppNav() {
  const pathname = usePathname() || "/";

  return (
    <>
      {/* mobile: fixed bottom bar */}
      <nav
        className="bottom-safe fixed inset-x-0 z-40 border-t border-line bg-[var(--bg)]/85 backdrop-blur-xl md:hidden"
        aria-label="Primary"
      >
        <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 py-1.5">
          {TABS.map((t) => {
            const active = t.match(pathname);
            const Icon = t.icon;
            return (
              <li key={t.href} className="flex-1">
                <Link
                  href={t.href}
                  className="group flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 transition"
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={
                      "relative flex h-7 w-7 items-center justify-center rounded-lg transition " +
                      (active ? "text-[var(--mint)]" : "text-[var(--fg-mut)] group-active:text-[var(--fg-dim)]")
                    }
                  >
                    {active && (
                      <span className="absolute inset-0 rounded-lg bg-[var(--mint-glow)]" />
                    )}
                    <Icon className="relative h-[18px] w-[18px]" />
                  </span>
                  <span
                    className={
                      "text-[10px] font-medium tracking-wide transition " +
                      (active ? "text-[var(--mint)]" : "text-[var(--fg-faint)]")
                    }
                  >
                    {t.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* desktop / wide: left sidebar */}
      <nav
        className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-line bg-[var(--bg-soft)] px-3 py-5 md:flex"
        aria-label="Primary"
      >
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--mint-glow)]">
            <span className="h-2.5 w-2.5 rounded-sm bg-[var(--mint)]" />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight">WealthFlow</span>
        </Link>
        <ul className="flex flex-col gap-1">
          {TABS.map((t) => {
            const active = t.match(pathname);
            const Icon = t.icon;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition " +
                    (active
                      ? "bg-[var(--card)] text-[var(--fg)]"
                      : "text-[var(--fg-mut)] hover:bg-[var(--card)]/60 hover:text-[var(--fg-dim)]")
                  }
                >
                  <Icon className={"h-[18px] w-[18px] " + (active ? "text-[var(--mint)]" : "")} />
                  <span className="font-medium">{t.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto flex flex-col gap-1">
          <Link
            href="/money/profile"
            aria-current={pathname.startsWith("/money/profile") ? "page" : undefined}
            className={
              "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition " +
              (pathname.startsWith("/money/profile")
                ? "bg-[var(--card)] text-[var(--fg)]"
                : "text-[var(--fg-mut)] hover:bg-[var(--card)]/60 hover:text-[var(--fg-dim)]")
            }
          >
            <IconProfile className={"h-[18px] w-[18px] " + (pathname.startsWith("/money/profile") ? "text-[var(--mint)]" : "")} />
            <span className="font-medium">Profile</span>
          </Link>
          <div className="px-2.5 pt-1 text-[11px] text-[var(--fg-faint)]">v1 · operator console</div>
        </div>
      </nav>
    </>
  );
}

/* ── line icons (1.6 stroke, no fills) ──────────────────────────────────────── */
type IP = React.SVGProps<SVGSVGElement>;
const base = (props: IP) => ({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...props });

function IconCapture(props: IP) {
  return (
    <svg {...base(props)}>
      <path d="M3 9a2 2 0 0 1 2-2h2l1.2-1.6A2 2 0 0 1 11 4.6h2a2 2 0 0 1 1.6.8L16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.2" />
      <path d="M12 9.8v-2M12 18.2v-2" opacity="0.35" />
    </svg>
  );
}
function IconMoney(props: IP) {
  return (
    <svg {...base(props)}>
      <path d="M3 7.5h18M3 7.5v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9M3 7.5 6 4h12l3 3.5" />
      <path d="M9 12.5h6M9 15h3" />
    </svg>
  );
}
function IconNews(props: IP) {
  return (
    <svg {...base(props)}>
      <path d="M5 4h11a1 1 0 0 1 1 1v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1z" />
      <path d="M8 8h6M8 11h6M8 14h4" />
      <path d="M17 9h2a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2" />
    </svg>
  );
}
function IconIdeas(props: IP) {
  return (
    <svg {...base(props)}>
      <path d="M12 3a6 6 0 0 1 4 10.5c-.6.6-1 1.4-1 2.2V17H9v-1.3c0-.8-.4-1.6-1-2.2A6 6 0 0 1 12 3z" />
      <path d="M9.5 20.5h5M10 17.8h4" />
    </svg>
  );
}
function IconChat(props: IP) {
  return (
    <svg {...base(props)}>
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 4v-4H6a2 2 0 0 1-2-2z" />
      <path d="M8.5 9.5h7M8.5 12.5h4" />
    </svg>
  );
}
function IconProfile(props: IP) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}
