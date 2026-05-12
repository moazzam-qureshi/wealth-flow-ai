import { z } from "zod";
import { ApiError, handler, json, requireApiUser } from "@/src/lib/api";
import { getAccount } from "@/src/db/accounts";
import {
  TXN_TYPES,
  findTransferCandidates,
  saveConfirmedTransaction,
} from "@/src/db/transactions";

const saveSchema = z.object({
  accountId: z.string().uuid(),
  uploadId: z.string().uuid().nullable().optional(),
  externalId: z.string().min(1).nullable().optional(),
  amount: z.union([z.string(), z.number()]).transform((v) => (typeof v === "number" ? v.toString() : v)),
  currency: z.string().min(2).max(10),
  direction: z.enum(["in", "out"]),
  txnType: z.enum(TXN_TYPES as [string, ...string[]]),
  counterparty: z.string().max(200).nullable().optional(),
  category: z.string().max(120).nullable().optional(),
  occurredAt: z.string().describe("ISO 8601"),
  confidence: z.number().min(0).max(1).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/**
 * POST a confirmed transaction (after the user has reviewed/corrected the
 * extracted fields). Saves it, updates the account balance, and returns any
 * likely "other half of a transfer" candidates for the user to optionally link.
 */
export const POST = handler(async (req: Request) => {
  await requireApiUser();
  const parsed = saveSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid body");
  const input = parsed.data;

  if (!(await getAccount(input.accountId))) throw new ApiError(404, "Account not found");
  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) throw new ApiError(400, "Invalid occurredAt");

  let saved;
  try {
    saved = await saveConfirmedTransaction({
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
    throw err;
  }

  // suggest transfer linking only for non-income/expense moves (or anything, really —
  // but income/expense are rarely transfers). We surface candidates regardless; the
  // UI decides whether to prompt.
  const candidates = await findTransferCandidates(saved);

  return json(
    {
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
