import { ApiError, handler, json, requireApiUser } from "@/src/lib/api";
import { listAccountTransactions } from "@/src/db/transactions";

// GET the transaction ledger for one of the user's accounts — newest first, each
// row annotated with the running balance after it. 404 if the account isn't yours.
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/accounts/[id]/transactions">) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const result = await listAccountTransactions(user.id, id);
  if (!result) throw new ApiError(404, "Account not found");
  return json({
    account: result.account,
    transactions: result.rows.map((t) => ({
      id: t.id,
      amount: t.amount,
      currency: t.currency,
      direction: t.direction,
      txnType: t.txnType,
      counterparty: t.counterparty,
      category: t.category,
      occurredAt: t.occurredAt.toISOString(),
      status: t.status,
      externalId: t.externalId,
      isTransfer: !!t.transferLinkId,
      uploadId: t.uploadId,
      notes: t.notes,
      balanceAfter: t.balanceAfter,
    })),
  });
});
