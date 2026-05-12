import { z } from "zod";
import { ApiError, handler, json, requireApiUser } from "@/src/lib/api";
import {
  REC_STATUSES,
  getRecommendation,
  updateRecommendationStatus,
} from "@/src/db/recommendations";

const patchSchema = z.object({
  status: z.enum(REC_STATUSES as [string, ...string[]]),
  snoozedUntil: z.string().nullable().optional(), // ISO; only used when status=snoozed
  outcomeNote: z.string().max(2000).nullable().optional(),
});

export const PATCH = handler(async (req: Request, ctx: RouteContext<"/api/recommendations/[id]">) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  if (!(await getRecommendation(user.id, id))) throw new ApiError(404, "Recommendation not found");

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid body");

  const snoozedUntil = parsed.data.snoozedUntil ? new Date(parsed.data.snoozedUntil) : undefined;
  if (snoozedUntil && Number.isNaN(snoozedUntil.getTime())) throw new ApiError(400, "Invalid snoozedUntil");

  const rec = await updateRecommendationStatus(user.id, id, parsed.data.status as never, {
    snoozedUntil,
    outcomeNote: parsed.data.outcomeNote,
  });
  return json({ recommendation: rec });
});
