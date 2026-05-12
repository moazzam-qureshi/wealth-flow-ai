import { z } from "zod";
import { ApiError, handler, json, requireApiUser } from "@/src/lib/api";
import {
  COMMON_PAYMENT_RAILS,
  getProfileNormalized,
  normalizeCapabilityGraph,
  updateCapabilityGraph,
  updateProfile,
  type CapabilityGraph,
} from "@/src/db/profile";

const tri = z.enum(["yes", "no", "unknown"]);
const graphSchema = z.object({
  usStockMarket: tri,
  usStockMarketVia: z.string().max(200),
  localStockMarket: tri,
  holdsForeignCurrency: tri,
  holdsStablecoins: tri,
  movesMoneyInternationally: tri,
  receivesCrossBorderIncome: tri,
  retirementAccounts: tri,
  // free text — any rail the user uses; normalized server-side (trim/lowercase/dedupe)
  paymentRails: z.array(z.string().max(60)).max(40),
  notes: z.string().max(2000),
});

const patchSchema = z.object({
  geography: z.string().max(120).optional(),
  displayCurrencyPref: z.string().min(2).max(10).optional(),
  homeCurrency: z.string().min(2).max(10).optional(),
  capabilityGraph: graphSchema.optional(),
});

export const GET = handler(async () => {
  const user = await requireApiUser();
  const p = await getProfileNormalized(user.id);
  return json({
    geography: p.geography,
    displayCurrencyPref: p.displayCurrencyPref,
    homeCurrency: p.homeCurrency,
    capabilityGraph: p.capabilityGraph,
    commonPaymentRails: COMMON_PAYMENT_RAILS,
  });
});

export const PATCH = handler(async (req: Request) => {
  const user = await requireApiUser();
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid body");
  const { capabilityGraph, ...rest } = parsed.data;

  if (Object.keys(rest).length > 0) {
    const cleaned: Record<string, unknown> = {};
    if (rest.geography !== undefined) cleaned.geography = rest.geography.trim();
    if (rest.displayCurrencyPref !== undefined) cleaned.displayCurrencyPref = rest.displayCurrencyPref.trim().toUpperCase();
    if (rest.homeCurrency !== undefined) cleaned.homeCurrency = rest.homeCurrency.trim().toUpperCase();
    await updateProfile(user.id, cleaned);
  }
  if (capabilityGraph) {
    await updateCapabilityGraph(user.id, normalizeCapabilityGraph(capabilityGraph) as CapabilityGraph);
  }
  const p = await getProfileNormalized(user.id);
  return json({
    geography: p.geography,
    displayCurrencyPref: p.displayCurrencyPref,
    homeCurrency: p.homeCurrency,
    capabilityGraph: p.capabilityGraph,
  });
});
