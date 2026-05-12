import { eq } from "drizzle-orm";
import { ApiError, handler, json, requireApiUser } from "@/src/lib/api";
import { db } from "@/src/db";
import { uploads } from "@/src/db/schema";
import { processUpload } from "@/src/lib/ingest";

/**
 * GET an upload's review payload — running (or re-running) vision extraction on
 * the already-stored blob. Used by /upload?uploadId=… after a Web Share Target
 * stashed an image. If it's already `extracted`, we still re-run (extraction is
 * cheap and the model may have improved); pass an optional ?accountId hint.
 */
export const GET = handler(async (req: Request, ctx: RouteContext<"/api/uploads/[id]">) => {
  await requireApiUser();
  const { id } = await ctx.params;
  const rows = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new ApiError(404, "Upload not found");

  const accountHint = new URL(req.url).searchParams.get("accountId");
  try {
    const payload = await processUpload(row, accountHint);
    return json(payload);
  } catch (err) {
    throw new ApiError(422, err instanceof Error ? err.message : "Extraction failed");
  }
});
