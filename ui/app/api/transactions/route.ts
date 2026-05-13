import { z } from "zod";
import { ApiError, handler, json, requireApiUser } from "@/src/lib/api";
import { getAccount } from "@/src/db/accounts";
import {
  TXN_TYPES,
  findTransferCandidates,
  saveConfirmedTransaction,
  saveTwoLeggedTransaction,
} from "@/src/db/transactions";

const numericStr = z.union([z.string(), z.number()]).transform((v) => (typeof v === "number" ? v.toString() : v));

const saveSchema = z
  .object({
    accountId: z.string().uuid(),
    /** Required when txnType is "transfer" or "investment" — the OTHER account
     *  the money lands in. Forbidden for income/expense (would be confusing). */
    destAccountId: z.string().uuid().nullable().optional(),
    /** Amount on the dest side (e.g. when source PKR → dest USD). Defaults to
     *  `amount` if unset. Only meaningful with destAccountId. */
    destAmount: numericStr.nullable().optional(),
    destCurrency: z.string().min(2).max(10).nullable().optional(),
    uploadId: z.string().uuid().nullable().optional(),
    externalId: z.string().min(1).nullable().optional(),
    amount: numericStr,
    currency: z.string().min(2).max(10),
    direction: z.enum(["in", "out"]),
    txnType: z.enum(TXN_TYPES as [string, ...string[]]),
    counterparty: z.string().max(200).nullable().optional(),
    category: z.string().max(120).nullable().optional(),
    occurredAt: z.string().describe("ISO 8601"),
    confidence: z.number().min(0).max(1).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    const twoLegged = v.txnType === "transfer" || v.txnType === "investment";
    if (twoLegged && !v.destAccountId) {
      ctx.addIssue({ code: "custom", path: ["destAccountId"], message: "Pick a destination account for a transfer/investment" });
    }
    if (!twoLegged && v.destAccountId) {
      ctx.addIssue({ code: "custom", path: ["destAccountId"], message: "destAccountId is only valid with txnType=transfer|investment" });
    }
    if (twoLegged && v.direction !== "out") {
      ctx.addIssue({ code: "custom", path: ["direction"], message: "A two-legged transfer/investment is recorded as the OUT leg on the source account" });
    }
  });

/**
 * POST a confirmed transaction. Two shapes:
 *  - income / expense  → one row, one balance update (source account only).
 *  - transfer / investment  → TWO rows (out on source, in on dest), pre-linked,
 *    both balances updated atomically. destAccountId is required.
 *
 * After saving, single-leg saves get the "find the other half" candidates so the
 * user can retroactively link a pre-existing matching out/in pair as a transfer.
 * Two-legged saves skip that — the link already exists.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const parsed = saveSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid body");
  const input = parsed.data;
  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) throw new ApiError(400, "Invalid occurredAt");

  // Ownership check on source (the helpers also verify, but a clearer 404 here).
  if (!(await getAccount(user.id, input.accountId))) throw new ApiError(404, "Account not found");

  const twoLegged = input.txnType === "transfer" || input.txnType === "investment";

  if (twoLegged) {
    if (input.accountId === input.destAccountId) throw new ApiError(400, "Source and destination must differ");
    if (!(await getAccount(user.id, input.destAccountId!))) throw new ApiError(404, "Destination account not found");
    try {
      const { source, dest } = await saveTwoLeggedTransaction(user.id, {
        sourceAccountId: input.accountId,
        destAccountId: input.destAccountId!,
        uploadId: input.uploadId ?? null,
        externalId: input.externalId ?? null,
        amount: input.amount,
        sourceCurrency: input.currency,
        destAmount: input.destAmount ?? null,
        destCurrency: input.destCurrency ?? null,
        txnType: input.txnType as "transfer" | "investment",
        counterparty: input.counterparty ?? null,
        category: input.category ?? null,
        occurredAt,
        confidence: input.confidence ?? null,
        notes: input.notes ?? null,
      });
      return json(
        {
          path: "two-legged",
          transaction: { id: source.id, accountId: source.accountId, amount: source.amount, currency: source.currency, direction: source.direction, txnType: source.txnType, counterparty: source.counterparty, category: source.category, occurredAt: source.occurredAt.toISOString() },
          counterpart: { id: dest.id, accountId: dest.accountId, amount: dest.amount, currency: dest.currency, direction: dest.direction },
          transferCandidates: [], // already linked — no need to prompt
        },
        { status: 201 },
      );
    } catch (err) {
      if ((err as { code?: string }).code === "DUPLICATE_TRANSACTION") {
        throw new ApiError(409, "A transaction with this reference already exists for this account");
      }
      if (err instanceof Error && err.message === "ACCOUNT_NOT_FOUND") throw new ApiError(404, "Account not found");
      if (err instanceof Error && err.message === "SAME_ACCOUNT") throw new ApiError(400, "Source and destination must differ");
      throw err;
    }
  }

  // Single-leg (income / expense) path. Defensive log: a transfer/investment
  // should never reach this branch (superRefine + the `if (twoLegged)` above
  // guarantee it). If it does, something is seriously wrong with validation.
  if (input.txnType === "transfer" || input.txnType === "investment") {
    console.error("[/api/transactions] BUG: transfer/investment reached single-leg path", {
      txnType: input.txnType,
      direction: input.direction,
      hasDestAccountId: !!input.destAccountId,
    });
    throw new ApiError(500, "Internal: transfer/investment without destination — refusing to save (this would lose money). Please report.");
  }
  let saved;
  try {
    saved = await saveConfirmedTransaction(user.id, {
      accountId: input.accountId,
      uploadId: input.uploadId ?? null,
      externalId: input.externalId ?? null,
      amount: input.amount,
      currency: input.currency,
      direction: input.direction,
      txnType: input.txnType as never,
      counterparty: input.counterparty ?? null,
      category: input.category ?? null,
      occurredAt,
      confidence: input.confidence ?? null,
      notes: input.notes ?? null,
    });
  } catch (err) {
    if ((err as { code?: string }).code === "DUPLICATE_TRANSACTION") {
      throw new ApiError(409, "A transaction with this reference already exists for this account");
    }
    if (err instanceof Error && err.message === "ACCOUNT_NOT_FOUND") throw new ApiError(404, "Account not found");
    throw err;
  }

  const candidates = await findTransferCandidates(user.id, saved);

  return json(
    {
      path: "single-leg",
      transaction: {
        id: saved.id,
        accountId: saved.accountId,
        amount: saved.amount,
        currency: saved.currency,
        direction: saved.direction,
        txnType: saved.txnType,
        counterparty: saved.counterparty,
        category: saved.category,
        occurredAt: saved.occurredAt.toISOString(),
      },
      transferCandidates: candidates.map((c) => ({
        id: c.id,
        accountId: c.accountId,
        amount: c.amount,
        currency: c.currency,
        direction: c.direction,
        counterparty: c.counterparty,
        occurredAt: c.occurredAt.toISOString(),
      })),
    },
    { status: 201 },
  );
});
