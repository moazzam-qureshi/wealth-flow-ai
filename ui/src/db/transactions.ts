/**
 * Transaction DB helpers: dedup checks, saving a confirmed transaction (with the
 * account-balance side-effect), and self-transfer linking.
 *
 * Dedup key = (accountId, externalId). When externalId is null we can't dedup, so
 * the UI nudges the user to supply it before saving.
 */
import { and, eq, gte, lte, isNull, ne, desc } from "drizzle-orm";
import { db } from "./index";
import { accounts, transactions, type Transaction } from "./schema";
import { applyDelta } from "./money";
import { isUsdEquivalent, usdRateMap } from "./fx";

export type TxnType = "income" | "expense" | "transfer" | "investment";
export type Direction = "in" | "out";

export const TXN_TYPES: TxnType[] = ["income", "expense", "transfer", "investment"];

/** Does a confirmed/needs-review txn already exist for this (account, externalId)? */
export async function findByExternalId(
  accountId: string,
  externalId: string,
): Promise<Transaction | undefined> {
  const rows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), eq(transactions.externalId, externalId)))
    .limit(1);
  return rows[0];
}

export type SaveTxnInput = {
  accountId: string;
  uploadId?: string | null;
  externalId?: string | null;
  amount: string; // positive numeric string
  currency: string;
  direction: Direction;
  txnType: TxnType;
  counterparty?: string | null;
  category?: string | null;
  occurredAt: Date;
  confidence?: number | null;
  rawExtractedJson?: unknown;
  notes?: string | null;
};

/**
 * Save a confirmed transaction and update the account balance accordingly.
 * - direction "in"  → balance += amount
 * - direction "out" → balance -= amount
 * Throws on duplicate (account, externalId). Runs in a transaction.
 */
export async function saveConfirmedTransaction(input: SaveTxnInput): Promise<Transaction> {
  return db.transaction(async (tx) => {
    if (input.externalId) {
      const dup = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.accountId, input.accountId), eq(transactions.externalId, input.externalId)))
        .limit(1);
      if (dup[0]) {
        const e = new Error("DUPLICATE_TRANSACTION");
        (e as { code?: string }).code = "DUPLICATE_TRANSACTION";
        throw e;
      }
    }

    const acct = await tx.select().from(accounts).where(eq(accounts.id, input.accountId)).limit(1);
    if (!acct[0]) throw new Error("ACCOUNT_NOT_FOUND");

    const inserted = await tx
      .insert(transactions)
      .values({
        accountId: input.accountId,
        uploadId: input.uploadId ?? null,
        externalId: input.externalId ?? null,
        amount: input.amount,
        currency: input.currency.trim().toUpperCase(),
        direction: input.direction,
        txnType: input.txnType,
        counterparty: input.counterparty?.trim() || null,
        category: input.category?.trim() || null,
        occurredAt: input.occurredAt,
        confidence: input.confidence ?? null,
        rawExtractedJson: input.rawExtractedJson ?? null,
        status: "confirmed",
        notes: input.notes?.trim() || null,
      })
      .returning();

    const delta = input.direction === "in" ? input.amount : `-${input.amount}`;
    await tx
      .update(accounts)
      .set({
        currentBalance: applyDelta(acct[0].currentBalance, delta),
        lastReconciledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, input.accountId));

    return inserted[0]!;
  });
}

/** Link two existing transactions as the two halves of a self-transfer. */
export async function linkAsTransfer(txnIdA: string, txnIdB: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({ transferLinkId: txnIdB, txnType: "transfer", updatedAt: new Date() })
      .where(eq(transactions.id, txnIdA));
    await tx
      .update(transactions)
      .set({ transferLinkId: txnIdA, txnType: "transfer", updatedAt: new Date() })
      .where(eq(transactions.id, txnIdB));
  });
}

export async function unlinkTransfer(txnId: string): Promise<void> {
  const row = (await db.select().from(transactions).where(eq(transactions.id, txnId)).limit(1))[0];
  if (!row?.transferLinkId) return;
  const otherId = row.transferLinkId;
  await db.transaction(async (tx) => {
    await tx.update(transactions).set({ transferLinkId: null, updatedAt: new Date() }).where(eq(transactions.id, txnId));
    await tx.update(transactions).set({ transferLinkId: null, updatedAt: new Date() }).where(eq(transactions.id, otherId));
  });
}

/**
 * Heuristic: find recently-saved transactions that look like the *other half* of a
 * just-saved transfer — opposite direction, in a different account, near in time,
 * and a roughly matching USD value. Returns candidates (UI asks the user to confirm).
 */
export async function findTransferCandidates(
  forTxn: Transaction,
  opts?: { withinHours?: number; usdTolerancePct?: number },
): Promise<Transaction[]> {
  const withinHours = opts?.withinHours ?? 48;
  const tolPct = opts?.usdTolerancePct ?? 8;
  const lo = new Date(forTxn.occurredAt.getTime() - withinHours * 3600_000);
  const hi = new Date(forTxn.occurredAt.getTime() + withinHours * 3600_000);

  const oppositeDir: Direction = forTxn.direction === "in" ? "out" : "in";
  const rows = await db
    .select()
    .from(transactions)
    .where(
      and(
        ne(transactions.accountId, forTxn.accountId),
        eq(transactions.direction, oppositeDir),
        eq(transactions.status, "confirmed"),
        isNull(transactions.transferLinkId),
        gte(transactions.occurredAt, lo),
        lte(transactions.occurredAt, hi),
      ),
    )
    .orderBy(desc(transactions.occurredAt))
    .limit(20);

  if (rows.length === 0) return [];

  // value-match in USD (best-available rates)
  const usdMap = new Map<string, number>([
    ...(await usdRateMap("interbank")),
    ...(await usdRateMap("open_market")),
  ]);
  const toUsd = (amount: string, ccy: string): number | null => {
    if (isUsdEquivalent(ccy)) return Number(amount);
    const r = usdMap.get(ccy.toUpperCase());
    return r && r > 0 ? Number(amount) / r : null;
  };
  const targetUsd = toUsd(forTxn.amount, forTxn.currency);
  if (targetUsd === null) return rows; // can't value-match → return all opposite-dir candidates

  return rows.filter((r) => {
    const u = toUsd(r.amount, r.currency);
    if (u === null) return true;
    const diffPct = (Math.abs(u - targetUsd) / targetUsd) * 100;
    return diffPct <= tolPct;
  });
}
