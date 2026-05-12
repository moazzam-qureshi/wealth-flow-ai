import { z } from "zod";
import { ApiError, handler, json, requireApiUser } from "@/src/lib/api";
import { linkAsTransfer, unlinkTransfer } from "@/src/db/transactions";

const schema = z.object({
  txnIdA: z.string().uuid(),
  txnIdB: z.string().uuid().optional(), // omit when unlinking
  action: z.enum(["link", "unlink"]).default("link"),
});

// Link two transactions as the two halves of a self-transfer (or unlink txnIdA).
export const POST = handler(async (req: Request) => {
  await requireApiUser();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid body");
  const { txnIdA, txnIdB, action } = parsed.data;

  if (action === "unlink") {
    await unlinkTransfer(txnIdA);
    return json({ ok: true });
  }
  if (!txnIdB) throw new ApiError(400, "txnIdB required to link");
  if (txnIdA === txnIdB) throw new ApiError(400, "Cannot link a transaction to itself");
  await linkAsTransfer(txnIdA, txnIdB);
  return json({ ok: true });
});
