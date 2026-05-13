/**
 * Transaction DB helpers: dedup checks, saving a confirmed transaction (with the
 * account-balance side-effect), and self-transfer linking. Owner-scoped — callers
 * pass the authenticated user's id; an account hint that isn't owned by that user
 * is treated as not-found.
 *
 * Two flavors of save:
 *   - `saveConfirmedTransaction` (income / expense): one row, one balance update.
 *     The destination of an expense is the outside world; not modeled.
 *   - `saveTwoLeggedTransaction` (transfer / investment): the money moves between
 *     two of the user's own accounts — so we insert BOTH legs in one DB
 *     transaction, pre-link them via transferLinkId, and update BOTH balances.
 *     This is how "money leaves ElevatePay AND arrives at IBKR" stays consistent
 *     (the old single-leg path made the money vanish).
 *
 * Dedup key = (accountId, externalId). When externalId is null we can't dedup, so
 * the UI nudges the user to supply it before saving.
 */
import { and, eq, gte, lte, isNull, ne, desc } from "drizzle-orm";
import { db } from "./index";
import { accounts, transactions, type Transaction } from "./schema";
import { applyDelta, negate } from "./money";
import { isUsdEquivalent, usdRateMap } from "./fx";

export type TxnType = "income" | "expense" | "transfer" | "investment";
export type Direction = "in" | "out";

export const TXN_TYPES: TxnType[] = ["income", "expense", "transfer", "investment"];

/**
 * Does a confirmed/needs-review txn already exist for this (account, externalId)?
 * accountId is already owner-scoped (an account belongs to one owner), but we pass
 * ownerId for an extra belt-and-braces filter.
 */
export async function findByExternalId(
  ownerId: string,
  accountId: string,
  externalId: string,
): Promise<Transaction | undefined> {
  const rows = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.ownerId, ownerId),
        eq(transactions.accountId, accountId),
        eq(transactions.externalId, externalId),
      ),
    )
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
 * Throws ACCOUNT_NOT_FOUND if the account doesn't belong to `ownerId`, and
 * DUPLICATE_TRANSACTION on a duplicate (account, externalId). Runs in a transaction.
 */
export async function saveConfirmedTransaction(ownerId: string, input: SaveTxnInput): Promise<Transaction> {
  return db.transaction(async (tx) => {
    const acct = await tx
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, input.accountId), eq(accounts.ownerId, ownerId)))
      .limit(1);
    if (!acct[0]) throw new Error("ACCOUNT_NOT_FOUND");

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

    const inserted = await tx
      .insert(transactions)
      .values({
        ownerId,
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

export type SaveTwoLeggedInput = {
  sourceAccountId: string;
  destAccountId: string;
  uploadId?: string | null;
  /** Reference id from the source-side receipt (dedup on the source leg). Dest leg
   *  has no externalId — it's a synthetic counterpart. */
  externalId?: string | null;
  /** Amount in the source account's currency. Always positive. */
  amount: string;
  sourceCurrency: string;
  /** If the source and dest are in different currencies, the amount that actually
   *  lands on the dest side (e.g. USD bought with PKR). Defaults to `amount` when
   *  currencies match and is left null otherwise — the user can edit later. */
  destAmount?: string | null;
  destCurrency?: string | null;
  txnType: "transfer" | "investment";
  counterparty?: string | null;
  category?: string | null;
  occurredAt: Date;
  confidence?: number | null;
  rawExtractedJson?: unknown;
  notes?: string | null;
};

/**
 * Save a two-legged transaction (transfer or investment) — money moves between
 * two of the user's own accounts. Atomic: either both legs + both balance updates
 * succeed, or nothing does. The two rows are pre-linked via `transferLinkId`.
 *
 * Throws:
 *   - SAME_ACCOUNT if source and dest are the same
 *   - ACCOUNT_NOT_FOUND if either account isn't owned by `ownerId`
 *   - DUPLICATE_TRANSACTION if (sourceAccountId, externalId) already exists
 */
export async function saveTwoLeggedTransaction(
  ownerId: string,
  input: SaveTwoLeggedInput,
): Promise<{ source: Transaction; dest: Transaction }> {
  if (input.sourceAccountId === input.destAccountId) {
    throw new Error("SAME_ACCOUNT");
  }

  return db.transaction(async (tx) => {
    const owned = await tx
      .select()
      .from(accounts)
      .where(and(eq(accounts.ownerId, ownerId)));
    const src = owned.find((a) => a.id === input.sourceAccountId);
    const dst = owned.find((a) => a.id === input.destAccountId);
    if (!src || !dst) throw new Error("ACCOUNT_NOT_FOUND");

    if (input.externalId) {
      const dup = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.accountId, input.sourceAccountId), eq(transactions.externalId, input.externalId)))
        .limit(1);
      if (dup[0]) {
        const e = new Error("DUPLICATE_TRANSACTION");
        (e as { code?: string }).code = "DUPLICATE_TRANSACTION";
        throw e;
      }
    }

    const sourceCurrency = input.sourceCurrency.trim().toUpperCase();
    const destCurrency = (input.destCurrency ?? src.currency).trim().toUpperCase();
    // If currencies match and destAmount wasn't specified, mirror the amount. If
    // they differ and no destAmount was given, leave it equal — the user can edit
    // the dest leg later. (We don't auto-convert via FX here: rates drift, and the
    // user knows the actual landed amount from their statement.)
    const destAmount = (input.destAmount ?? input.amount).trim();

    // Insert source leg (out) first — needs an id to point dest's transferLinkId at.
    const [source] = await tx
      .insert(transactions)
      .values({
        ownerId,
        accountId: input.sourceAccountId,
        uploadId: input.uploadId ?? null,
        externalId: input.externalId ?? null,
        amount: input.amount,
        currency: sourceCurrency,
        direction: "out",
        txnType: input.txnType,
        counterparty: input.counterparty?.trim() || dst.name,
        category: input.category?.trim() || null,
        occurredAt: input.occurredAt,
        confidence: input.confidence ?? null,
        rawExtractedJson: input.rawExtractedJson ?? null,
        status: "confirmed",
        notes: input.notes?.trim() || null,
      })
      .returning();

    const [dest] = await tx
      .insert(transactions)
      .values({
        ownerId,
        accountId: input.destAccountId,
        uploadId: input.uploadId ?? null,
        externalId: null, // synthetic counterpart — no receipt
        amount: destAmount,
        currency: destCurrency,
        direction: "in",
        txnType: input.txnType,
        counterparty: input.counterparty?.trim() || src.name,
        category: input.category?.trim() || null,
        occurredAt: input.occurredAt,
        confidence: input.confidence ?? null,
        status: "confirmed",
        notes: input.notes?.trim() || null,
        transferLinkId: source!.id,
      })
      .returning();

    // close the link: point source at dest
    await tx
      .update(transactions)
      .set({ transferLinkId: dest!.id, updatedAt: new Date() })
      .where(eq(transactions.id, source!.id));

    // update both balances
    await tx
      .update(accounts)
      .set({
        currentBalance: applyDelta(src.currentBalance, negate(input.amount)),
        lastReconciledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, src.id));
    await tx
      .update(accounts)
      .set({
        currentBalance: applyDelta(dst.currentBalance, destAmount),
        lastReconciledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, dst.id));

    return { source: { ...source!, transferLinkId: dest!.id }, dest: dest! };
  });
}

/**
 * The full transaction history for one of the user's accounts (newest first),
 * each row annotated with the running balance *after* that transaction (computed
 * by walking back from the account's current balance). Returns null if the account
 * isn't the user's.
 */
export async function listAccountTransactions(
  ownerId: string,
  accountId: string,
): Promise<{ account: { id: string; name: string; currency: string; currentBalance: string }; rows: (Transaction & { balanceAfter: string })[] } | null> {
  const acct = (
    await db.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.ownerId, ownerId))).limit(1)
  )[0];
  if (!acct) return null;

  const rows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ownerId, ownerId), eq(transactions.accountId, accountId)))
    .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt));

  // Walk newest→oldest: balanceAfter[newest] = currentBalance; then undo this row's
  // signed effect to get the balance *before* it (= balanceAfter of the next row).
  let running = acct.currentBalance;
  const annotated = rows.map((r) => {
    const after = running;
    const signedEffect = r.direction === "in" ? r.amount : negate(r.amount);
    running = applyDelta(running, negate(signedEffect)); // undo → balance before this row
    return { ...r, balanceAfter: after };
  });
  return { account: { id: acct.id, name: acct.name, currency: acct.currency, currentBalance: acct.currentBalance }, rows: annotated };
}

/**
 * Delete one of the user's transactions and reverse its effect on the account
 * balance (in a DB transaction). If it was half of a linked transfer/investment,
 * BOTH legs are deleted and BOTH balances are reversed — keeping the pair
 * consistent (the alternative, leaving the other half dangling, makes the totals
 * mysteriously wrong). Use `unlinkTransfer` first if you want to break the link
 * and keep one of the legs as a standalone transaction.
 */
export async function deleteTransaction(ownerId: string, txnId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const row = (
      await tx.select().from(transactions).where(and(eq(transactions.id, txnId), eq(transactions.ownerId, ownerId))).limit(1)
    )[0];
    if (!row) return false;

    // collect rows to delete: this one, plus the linked half if any
    const toDelete: Transaction[] = [row];
    if (row.transferLinkId) {
      const other = (
        await tx
          .select()
          .from(transactions)
          .where(and(eq(transactions.id, row.transferLinkId), eq(transactions.ownerId, ownerId)))
          .limit(1)
      )[0];
      if (other) toDelete.push(other);
    }

    // reverse each row's balance effect
    for (const r of toDelete) {
      const undo = r.direction === "in" ? negate(r.amount) : r.amount;
      const acct = (await tx.select().from(accounts).where(eq(accounts.id, r.accountId)).limit(1))[0];
      if (acct) {
        await tx
          .update(accounts)
          .set({ currentBalance: applyDelta(acct.currentBalance, undo), updatedAt: new Date() })
          .where(eq(accounts.id, r.accountId));
      }
    }

    // delete the rows themselves
    for (const r of toDelete) {
      await tx.delete(transactions).where(and(eq(transactions.id, r.id), eq(transactions.ownerId, ownerId)));
    }
    return true;
  });
}

/** Link two of the user's own transactions as the two halves of a self-transfer. */
export async function linkAsTransfer(ownerId: string, txnIdA: string, txnIdB: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({ transferLinkId: txnIdB, txnType: "transfer", updatedAt: new Date() })
      .where(and(eq(transactions.id, txnIdA), eq(transactions.ownerId, ownerId)));
    await tx
      .update(transactions)
      .set({ transferLinkId: txnIdA, txnType: "transfer", updatedAt: new Date() })
      .where(and(eq(transactions.id, txnIdB), eq(transactions.ownerId, ownerId)));
  });
}

export async function unlinkTransfer(ownerId: string, txnId: string): Promise<void> {
  const row = (
    await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, txnId), eq(transactions.ownerId, ownerId)))
      .limit(1)
  )[0];
  if (!row?.transferLinkId) return;
  const otherId = row.transferLinkId;
  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({ transferLinkId: null, updatedAt: new Date() })
      .where(and(eq(transactions.id, txnId), eq(transactions.ownerId, ownerId)));
    await tx
      .update(transactions)
      .set({ transferLinkId: null, updatedAt: new Date() })
      .where(and(eq(transactions.id, otherId), eq(transactions.ownerId, ownerId)));
  });
}

/**
 * Heuristic: find recently-saved transactions (of the same owner) that look like
 * the *other half* of a just-saved transfer — opposite direction, in a different
 * account, near in time, and a roughly matching USD value. Returns candidates (UI
 * asks the user to confirm).
 */
export async function findTransferCandidates(
  ownerId: string,
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
        eq(transactions.ownerId, ownerId),
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
