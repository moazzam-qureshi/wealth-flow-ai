import { ApiError, handler, json, requireApiUser } from "@/src/lib/api";
import { deleteTransaction } from "@/src/db/transactions";

// DELETE one of the user's transactions — also reverses its effect on the account
// balance (and unlinks the other half if it was a transfer). 404 if not yours.
export const DELETE = handler(async (_req: Request, ctx: RouteContext<"/api/transactions/[id]">) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const ok = await deleteTransaction(user.id, id);
  if (!ok) throw new ApiError(404, "Transaction not found");
  return json({ ok: true });
});
