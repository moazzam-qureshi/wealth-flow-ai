/**
 * Per-user `profile` row (PK = owner_id). Geography, display-currency preference,
 * the **capability graph** (Layer 2 — what the user can REALISTICALLY do
 * financially), psychology notes (Layer 5 — empty in v1), and preferences.
 *
 * Capability-graph principle: defaults are "unknown", never assumed `false`. The
 * product's whole thesis is that advice must be grounded in the user's *real*
 * constraints — so the agents are told: never assume a capability; check the graph;
 * if it's "unknown", ask (chat) or flag the uncertainty (strategist). The user
 * fills this in on the Profile screen.
 */
import { eq } from "drizzle-orm";
import { db } from "./index";
import { profile, type Profile } from "./schema";

// "yes" | "no" | "unknown" — tri-state so we can distinguish "I can't" from "not recorded yet".
export type Tri = "yes" | "no" | "unknown";

// Common rails offered as quick-pick chips. NOT an exhaustive enum — the user can
// add any custom rail; payment rails are stored as free-text strings.
export const COMMON_PAYMENT_RAILS = [
  "local_bank_transfer", // e.g. Raast / IBFT
  "payoneer",
  "wise",
  "paypal",
  "crypto", // on-chain transfers / stablecoins
  "binance_p2p",
  "western_union",
  "remittance_app", // e.g. local remittance services
  "credit_debit_card",
] as const;
/** @deprecated use COMMON_PAYMENT_RAILS — kept so existing imports don't break */
export const PAYMENT_RAILS = COMMON_PAYMENT_RAILS;
export type PaymentRail = string; // free text — any rail the user uses

/** normalize a payment-rail string: trim, lowercase, spaces→underscores; drop empties/dupes */
export function normalizeRailList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r !== "string") continue;
    const v = r.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 60);
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

export type CapabilityGraph = {
  /** can buy/hold US (international) stocks — e.g. via IBKR */
  usStockMarket: Tri;
  /** which broker / how (free text, e.g. "IBKR via USD account") */
  usStockMarketVia: string;
  /** can buy/hold local stock market (e.g. PSX) */
  localStockMarket: Tri;
  /** can hold foreign currency (USD etc.) */
  holdsForeignCurrency: Tri;
  /** can hold stablecoins (USDT/USDC) */
  holdsStablecoins: Tri;
  /** can move money internationally (in or out of the country) */
  movesMoneyInternationally: Tri;
  /** can receive cross-border income easily (freelance/business) */
  receivesCrossBorderIncome: Tri;
  /** has access to retirement / tax-advantaged accounts */
  retirementAccounts: Tri;
  /** payment rails the user actually relies on — free-text strings (any rail) */
  paymentRails: string[];
  /** anything else worth knowing about their financial access/constraints */
  notes: string;
};

export const DEFAULT_CAPABILITY_GRAPH: CapabilityGraph = {
  usStockMarket: "unknown",
  usStockMarketVia: "",
  localStockMarket: "unknown",
  holdsForeignCurrency: "unknown",
  holdsStablecoins: "unknown",
  movesMoneyInternationally: "unknown",
  receivesCrossBorderIncome: "unknown",
  retirementAccounts: "unknown",
  paymentRails: [],
  notes: "",
};

const DEFAULTS = {
  geography: "",
  displayCurrencyPref: "USD",
  homeCurrency: "PKR",
  capabilityGraphJson: DEFAULT_CAPABILITY_GRAPH as unknown,
  psychologyNotesJson: [] as unknown[],
  preferencesJson: {} as Record<string, unknown>,
} satisfies Partial<Profile>;

/** Merge a stored (possibly partial / old-shape) capability graph with the defaults. */
export function normalizeCapabilityGraph(raw: unknown): CapabilityGraph {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<CapabilityGraph> & Record<string, unknown>;
  const tri = (v: unknown): Tri => (v === "yes" || v === "no" || v === "unknown" ? v : v === true ? "yes" : v === false ? "no" : "unknown");
  return {
    usStockMarket: tri(r.usStockMarket ?? r["canAccessUsMarkets"]),
    usStockMarketVia: typeof r.usStockMarketVia === "string" ? r.usStockMarketVia : "",
    localStockMarket: tri(r.localStockMarket),
    holdsForeignCurrency: tri(r.holdsForeignCurrency),
    holdsStablecoins: tri(r.holdsStablecoins),
    movesMoneyInternationally: tri(r.movesMoneyInternationally),
    receivesCrossBorderIncome: tri(r.receivesCrossBorderIncome),
    retirementAccounts: tri(r.retirementAccounts),
    paymentRails: normalizeRailList(r.paymentRails), // free text — any rail
    notes: typeof r.notes === "string" ? r.notes : "",
  };
}

/** Get (creating on first access) the profile row for a user. */
export async function getProfile(ownerId: string): Promise<Profile> {
  const rows = await db.select().from(profile).where(eq(profile.ownerId, ownerId)).limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db.insert(profile).values({ ownerId, ...DEFAULTS }).onConflictDoNothing().returning();
  if (inserted[0]) return inserted[0];
  const again = await db.select().from(profile).where(eq(profile.ownerId, ownerId)).limit(1);
  return again[0]!;
}

/** Profile with the capability graph normalized to the current shape. */
export async function getProfileNormalized(ownerId: string) {
  const p = await getProfile(ownerId);
  return { ...p, capabilityGraph: normalizeCapabilityGraph(p.capabilityGraphJson) };
}

export async function updateProfile(ownerId: string, patch: Partial<Omit<Profile, "ownerId">>): Promise<Profile> {
  await getProfile(ownerId); // ensure the row exists
  const updated = await db
    .update(profile)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(profile.ownerId, ownerId))
    .returning();
  return updated[0]!;
}

export async function updateCapabilityGraph(ownerId: string, graph: CapabilityGraph): Promise<Profile> {
  return updateProfile(ownerId, { capabilityGraphJson: normalizeCapabilityGraph(graph) as unknown });
}
