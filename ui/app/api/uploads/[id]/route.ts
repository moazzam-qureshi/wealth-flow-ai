import { and, eq } from "drizzle-orm";
import { ApiError, handler, json, requireApiUser } from "@/src/lib/api";
import { db } from "@/src/db";
import { uploads } from "@/src/db/schema";
import { processUpload } from "@/src/lib/ingest";

/**
 * GET an upload's review payload — running (or re-running) vision extraction on
 * the already-stored blob. Used by /upload?uploadId=… after a Web Share Target
 * stashed an image. If it's already `extracted`, we still re-run (extraction is
 * cheap and the model may have improved); pass an optional ?accountId hint.
 * Scoped to the signed-in user — you can only re-process your own uploads.
 */
export const GET = handler(async (req: Request, ctx: RouteContext<"/api/uploads/[id]">) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const rows = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, id), eq(uploads.ownerId, user.id)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ApiError(404, "Upload not found");

  const accountHint = new URL(req.url).searchParams.get("accountId");
  try {
    const payload = await processUpload(user.id, row, accountHint);
    return json(payload);
  } catch (err) {
    throw new ApiError(422, err instanceof Error ? err.message : "Extraction failed");
  }
});
