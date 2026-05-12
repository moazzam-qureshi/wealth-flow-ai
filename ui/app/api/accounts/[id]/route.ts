import { z } from "zod";
import { ApiError, handler, json, requireApiUser } from "@/src/lib/api";
import {
  ACCOUNT_TYPES,
  archiveAccount,
  getAccount,
  unarchiveAccount,
  updateAccount,
} from "@/src/db/accounts";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  currency: z.string().min(2).max(10).optional(),
  institution: z.string().max(120).nullable().optional(),
  currentBalance: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? v.toString() : v))
    .optional(),
  notes: z.string().max(2000).nullable().optional(),
  archived: z.boolean().optional(), // true → archive, false → unarchive
});

export const PATCH = handler(async (req: Request, ctx: RouteContext<"/api/accounts/[id]">) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  if (!(await getAccount(user.id, id))) throw new ApiError(404, "Account not found");

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid body");
  const { archived, ...patch } = parsed.data;

  if (archived === true) await archiveAccount(user.id, id);
  if (archived === false) await unarchiveAccount(user.id, id);

  if (Object.keys(patch).length > 0) {
    await updateAccount(user.id, id, patch as Parameters<typeof updateAccount>[2]);
  }
  const account = await getAccount(user.id, id);
  return json({ account });
});

export const DELETE = handler(async (_req: Request, ctx: RouteContext<"/api/accounts/[id]">) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  if (!(await getAccount(user.id, id))) throw new ApiError(404, "Account not found");
  await archiveAccount(user.id, id); // soft delete — keeps historical transactions valid
  return json({ ok: true });
});
