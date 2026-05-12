/**
 * Money helpers. Balances/amounts are `numeric` in Postgres and arrive as strings.
 * We do arithmetic in integer "minor units" scaled by 1e4 to match the column
 * scale (4 dp) and avoid float drift, then format back to strings for storage.
 *
 * Keep all money math here so the rest of the app never touches `Number()` on a
 * balance directly.
 */

const SCALE = 10_000n; // 4 decimal places

/** Parse a numeric-string (e.g. "1234.5600") into scaled bigint minor units. */
export function toMinor(value: string | number): bigint {
  const s = typeof value === "number" ? value.toString() : value.trim();
  const neg = s.startsWith("-");
  const [intPart, fracPartRaw = ""] = (neg ? s.slice(1) : s).split(".");
  const fracPart = (fracPartRaw + "0000").slice(0, 4); // pad/truncate to 4 dp
  const minor = BigInt(intPart || "0") * SCALE + BigInt(fracPart || "0");
  return neg ? -minor : minor;
}

/** Format scaled bigint minor units back into a numeric string with 4 dp. */
export function fromMinor(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const intPart = abs / SCALE;
  const fracPart = (abs % SCALE).toString().padStart(4, "0");
  return `${neg ? "-" : ""}${intPart}.${fracPart}`;
}

/** Add a signed delta (in the same currency) to a stored balance string. */
export function applyDelta(balance: string, delta: string | number): string {
  return fromMinor(toMinor(balance) + toMinor(delta));
}

/** Negate a numeric-string (handles "-x" → "x" cleanly, unlike string-prefixing). */
export function negate(value: string | number): string {
  return fromMinor(-toMinor(value));
}

/** Convert an amount from one currency to another using a rate (quote per base). */
export function convert(amount: string | number, rateQuotePerBase: string | number): string {
  // amountMinor * rateMinor / SCALE  (rate also held at 4dp precision here)
  const a = toMinor(amount);
  const r = toMinor(rateQuotePerBase);
  return fromMinor((a * r) / SCALE);
}

/** For display: a JS number — fine for rendering, never for storage. */
export function toDisplayNumber(value: string): number {
  return Number(value);
}
