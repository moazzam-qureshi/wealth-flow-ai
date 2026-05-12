import { z } from "zod";
import { ApiError, handler, json, requireApiUser } from "@/src/lib/api";
import { ACCOUNT_TYPES, createAccount, listAccounts } from "@/src/db/accounts";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.string().min(2).max(10),
  institution: z.string().max(120).optional(),
  currentBalance: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? v.toString() : v))
    .optional(),
  notes: z.string().max(2000).optional(),
});

export const GET = handler(async () => {
  await requireApiUser();
  const accounts = await listAccounts({ includeArchived: true });
  return json({ accounts });
});

export const POST = handler(async (req: Request) => {
  await requireApiUser();
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid body");
  const account = await createAccount(parsed.data);
  return json({ account }, { status: 201 });
});
