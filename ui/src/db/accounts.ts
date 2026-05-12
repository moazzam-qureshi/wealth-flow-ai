/**
 * Account query helpers. Accounts are the user's "financial reality map" (Layer 1):
 * the set of banks / fintech apps / exchanges / wallets / cash they actually have.
 * Entered manually, rarely change.
 *
 * Every function is owner-scoped: callers pass the authenticated user's id and we
 * filter / set `owner_id` accordingly. Cross-owner access is impossible by
 * construction (no query touches a row whose owner_id ≠ the passed ownerId).
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "./index";
import { accounts, type Account, type NewAccount } from "./schema";

export const ACCOUNT_TYPES = [
  "local_bank",
  "usd_bank",
  "fintech",
  "brokerage",
  "crypto_exchange",
  "stablecoin_wallet",
  "cash",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  local_bank: "Local bank",
  usd_bank: "USD bank",
  fintech: "Fintech app",
  brokerage: "Brokerage (stocks)",
  crypto_exchange: "Crypto exchange",
  stablecoin_wallet: "Stablecoin wallet",
  cash: "Cash",
};

export async function listAccounts(ownerId: string, opts?: { includeArchived?: boolean }): Promise<Account[]> {
  const where = opts?.includeArchived
    ? eq(accounts.ownerId, ownerId)
    : and(eq(accounts.ownerId, ownerId), isNull(accounts.archived));
  return db
    .select()
    .from(accounts)
    .where(where)
    .orderBy(asc(accounts.type), asc(accounts.name));
}

/** Returns the account only if it belongs to `ownerId` (otherwise undefined). */
export async function getAccount(ownerId: string, id: string): Promise<Account | undefined> {
  const rows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.ownerId, ownerId)))
    .limit(1);
  return rows[0];
}

export async function createAccount(
  ownerId: string,
  input: Pick<NewAccount, "name" | "type" | "currency"> &
    Partial<Pick<NewAccount, "institution" | "currentBalance" | "notes" | "lastReconciledAt">>,
): Promise<Account> {
  const rows = await db
    .insert(accounts)
    .values({
      ownerId,
      name: input.name.trim(),
      type: input.type,
      currency: input.currency.trim().toUpperCase(),
      institution: input.institution?.trim() || null,
      currentBalance: input.currentBalance ?? "0",
      notes: input.notes?.trim() || null,
      lastReconciledAt: input.lastReconciledAt ?? null,
    })
    .returning();
  return rows[0]!;
}

export async function updateAccount(
  ownerId: string,
  id: string,
  patch: Partial<Pick<Account, "name" | "type" | "currency" | "institution" | "currentBalance" | "notes" | "lastReconciledAt">>,
): Promise<Account | undefined> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.type !== undefined) set.type = patch.type;
  if (patch.currency !== undefined) set.currency = patch.currency.trim().toUpperCase();
  if (patch.institution !== undefined) set.institution = patch.institution?.trim() || null;
  if (patch.currentBalance !== undefined) set.currentBalance = patch.currentBalance;
  if (patch.notes !== undefined) set.notes = patch.notes?.trim() || null;
  if (patch.lastReconciledAt !== undefined) set.lastReconciledAt = patch.lastReconciledAt;
  const rows = await db
    .update(accounts)
    .set(set)
    .where(and(eq(accounts.id, id), eq(accounts.ownerId, ownerId)))
    .returning();
  return rows[0];
}

/** Soft-delete (archive) — keeps the row so historical transactions stay valid. */
export async function archiveAccount(ownerId: string, id: string): Promise<void> {
  await db
    .update(accounts)
    .set({ archived: new Date(), updatedAt: new Date() })
    .where(and(eq(accounts.id, id), eq(accounts.ownerId, ownerId), isNull(accounts.archived)));
}

export async function unarchiveAccount(ownerId: string, id: string): Promise<void> {
  await db
    .update(accounts)
    .set({ archived: null, updatedAt: new Date() })
    .where(and(eq(accounts.id, id), eq(accounts.ownerId, ownerId)));
}
