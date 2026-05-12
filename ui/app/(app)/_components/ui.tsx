/**
 * Shared presentation primitives for the operator-console look. Server-safe
 * (no hooks) so they can be used directly in server components.
 */
import Link from "next/link";

// ── card ─────────────────────────────────────────────────────────────────────
export function Card({
  children,
  className = "",
  as: As = "div",
  href,
  glow = false,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
  href?: string;
  glow?: boolean;
  style?: React.CSSProperties;
}) {
  const cls =
    "relative overflow-hidden rounded-2xl border border-line bg-[var(--card)] " +
    (glow ? "before:absolute before:inset-x-0 before:-top-px before:h-px before:bg-gradient-to-r before:from-transparent before:via-[var(--mint)]/40 before:to-transparent " : "") +
    className;
  if (href) {
    return (
      <Link href={href} className={cls + " block transition hover:bg-[var(--card-hi)]"} style={style}>
        {children}
      </Link>
    );
  }
  return <As className={cls} style={style}>{children}</As>;
}

// ── section heading ──────────────────────────────────────────────────────────
export function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-end justify-between">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fg-mut)]">{children}</h2>
      {action}
    </div>
  );
}

// ── small stat tile ──────────────────────────────────────────────────────────
export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "neutral" | "mint" | "cyan" | "amber" | "coral";
}) {
  const valColor =
    tone === "mint" ? "text-[var(--mint)]" : tone === "cyan" ? "text-[var(--cyan)]" : tone === "amber" ? "text-[var(--amber)]" : tone === "coral" ? "text-[var(--coral)]" : "text-[var(--fg)]";
  return (
    <Card className="p-3.5">
      <div className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--fg-mut)]">{label}</div>
      <div className={"readout mt-1.5 text-[20px] font-medium " + valColor}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-[var(--fg-faint)]">{sub}</div>}
    </Card>
  );
}

// ── trend pill (▲ / ▼ / —) ───────────────────────────────────────────────────
export function TrendPill({ delta, suffix = "" }: { delta: number | null; suffix?: string }) {
  if (delta === null) return <span className="text-[var(--fg-faint)]">—</span>;
  const up = delta > 0;
  const flat = delta === 0;
  const color = flat ? "text-[var(--fg-mut)] bg-[var(--card-hi)]" : up ? "text-[var(--mint)] bg-[var(--mint-glow)]" : "text-[var(--coral)] bg-[rgba(255,107,107,0.12)]";
  const arrow = flat ? "→" : up ? "▲" : "▼";
  return (
    <span className={"inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums " + color}>
      <span className="text-[9px]">{arrow}</span>
      {Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 2 })}
      {suffix}
    </span>
  );
}

// ── runway "fuel gauge" — a thin filled meter, color by months ───────────────
export function RunwayMeter({ months }: { months: number | null }) {
  if (months === null) {
    return <div className="text-sm text-[var(--fg-faint)]">No runway estimate yet — needs FX rates and a few transactions.</div>;
  }
  const cap = 12; // bar maxes out at 12 months
  const filled = Math.max(0, Math.min(1, months / cap));
  const color = months >= 6 ? "var(--mint)" : months >= 3 ? "var(--amber)" : "var(--coral)";
  const glow = months >= 6 ? "var(--mint-glow)" : months >= 3 ? "rgba(245,185,66,0.16)" : "rgba(255,107,107,0.16)";
  const label = months >= 24 ? `${(months / 12).toFixed(1)} years` : `${months.toFixed(1)} months`;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="readout text-[22px] font-medium" style={{ color }}>{label}</span>
        <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--fg-mut)]">runway</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-soft)]">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${filled * 100}%`, background: color, boxShadow: `0 0 12px ${glow}` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-[var(--fg-faint)]">
        <span>0</span><span>3mo</span><span>6mo</span><span>12mo+</span>
      </div>
    </div>
  );
}

// ── currency-exposure segmented light-strip ──────────────────────────────────
export function ExposureBar({
  usdPct,
  homePct,
  otherPct,
  homeCurrency,
}: {
  usdPct: number | null;
  homePct: number | null;
  otherPct: number | null;
  homeCurrency: string;
}) {
  if (usdPct === null) return <div className="text-sm text-[var(--fg-faint)]">Needs FX rates to compute exposure.</div>;
  const u = Math.max(0, usdPct), h = Math.max(0, homePct ?? 0), o = Math.max(0, otherPct ?? 0);
  const fmt = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        <span className="rounded-l-full" style={{ width: `${u}%`, background: "var(--mint)", boxShadow: "inset 0 0 8px rgba(0,0,0,0.25)" }} title={`USD ${fmt(usdPct)}`} />
        <span style={{ width: `${h}%`, background: "var(--cyan)" }} title={`${homeCurrency} ${fmt(homePct)}`} />
        <span className="rounded-r-full" style={{ width: `${o}%`, background: "var(--fg-faint)" }} title={`Other ${fmt(otherPct)}`} />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <Legend color="var(--mint)" label="USD" value={fmt(usdPct)} />
        <Legend color="var(--cyan)" label={homeCurrency} value={fmt(homePct)} />
        <Legend color="var(--fg-faint)" label="Other" value={fmt(otherPct)} />
      </div>
    </div>
  );
}
function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[var(--fg-dim)]">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      <span>{label}</span>
      <span className="readout text-[var(--fg-mut)]">{value}</span>
    </span>
  );
}

// ── tiny inline sparkline (accent only, no axes) ─────────────────────────────
export function Sparkline({ points, color = "var(--mint)", w = 120, h = 28 }: { points: number[]; color?: string; w?: number; h?: number }) {
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - ((p - min) / span) * h).toFixed(1)}`).join(" ");
  const last = `${((points.length - 1) * step).toFixed(1)},${(h - ((points[points.length - 1] - min) / span) * h).toFixed(1)}`;
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      <circle cx={last.split(",")[0]} cy={last.split(",")[1]} r={2.2} fill={color} />
    </svg>
  );
}

// ── currency avatar for account cards ────────────────────────────────────────
const CCY_TONE: Record<string, { bg: string; fg: string }> = {
  USD: { bg: "var(--mint-glow)", fg: "var(--mint)" },
  USDT: { bg: "var(--mint-glow)", fg: "var(--mint)" },
  USDC: { bg: "var(--mint-glow)", fg: "var(--mint)" },
  PKR: { bg: "rgba(76,201,240,0.14)", fg: "var(--cyan)" },
  EUR: { bg: "rgba(167,139,250,0.14)", fg: "var(--violet)" },
  GBP: { bg: "rgba(167,139,250,0.14)", fg: "var(--violet)" },
  AED: { bg: "rgba(245,185,66,0.14)", fg: "var(--amber)" },
};
export function CcyAvatar({ currency }: { currency: string }) {
  const t = CCY_TONE[currency.toUpperCase()] ?? { bg: "var(--card-hi)", fg: "var(--fg-dim)" };
  return (
    <span className="readout grid h-9 w-9 shrink-0 place-items-center rounded-full text-[10px] font-semibold" style={{ background: t.bg, color: t.fg }}>
      {currency.toUpperCase().slice(0, 4)}
    </span>
  );
}

// ── primary / ghost buttons ──────────────────────────────────────────────────
export function buttonPrimary(extra = "") {
  return "inline-flex items-center justify-center rounded-xl bg-[var(--mint)] px-4 py-2.5 text-sm font-semibold text-[#04130d] transition hover:brightness-110 active:brightness-95 disabled:opacity-50 " + extra;
}
export function buttonGhost(extra = "") {
  return "inline-flex items-center justify-center rounded-xl border border-line px-4 py-2.5 text-sm text-[var(--fg-dim)] transition hover:bg-[var(--card-hi)] hover:text-[var(--fg)] disabled:opacity-50 " + extra;
}

// ── confidence chip ──────────────────────────────────────────────────────────
export function ConfChip({ level }: { level: string | null }) {
  if (!level) return null;
  const m: Record<string, string> = {
    high: "text-[var(--mint)] bg-[var(--mint-glow)]",
    medium: "text-[var(--amber)] bg-[rgba(245,185,66,0.14)]",
    low: "text-[var(--fg-mut)] bg-[var(--card-hi)]",
  };
  return <span className={"rounded-full px-2 py-0.5 text-[10.5px] font-medium " + (m[level] ?? m.low)}>{level} confidence</span>;
}

// ── money formatting helpers ─────────────────────────────────────────────────
export function fmtMoney(n: number | null, ccy: string, opts?: { maxFrac?: number }) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const symbol = ccy === "USD" ? "$" : ccy === "USDT" || ccy === "USDC" ? "$" : `${ccy} `;
  return `${symbol}${n.toLocaleString(undefined, { maximumFractionDigits: opts?.maxFrac ?? 0 })}`;
}
