import { ApiError, handler, json, requireApiUser } from "@/src/lib/api";
import { db } from "@/src/db";
import { uploads } from "@/src/db/schema";
import { makeBlobKey, putBlob } from "@/src/lib/blob";
import { processUpload } from "@/src/lib/ingest";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

/**
 * POST a screenshot/receipt (multipart/form-data: `file`, optional `accountId`).
 * → store the blob, run vision extraction, return a review payload the user
 * confirms on /upload. Nothing is written to `transactions` here.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();

  const form = await req.formData().catch(() => null);
  if (!form) throw new ApiError(400, "Expected multipart/form-data");
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Missing `file`");
  if (file.size > MAX_BYTES) throw new ApiError(413, "File too large (max 12 MB)");

  const mime = file.type || "image/png";
  const ext = EXT_BY_MIME[mime] ?? "bin";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = makeBlobKey(ext);

  // Store the blob.
  try {
    await putBlob(key, bytes, mime);
  } catch (err) {
    console.error("[uploads] putBlob failed:", err);
    throw new ApiError(502, `Blob storage failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Record the upload.
  let uploadRow;
  try {
    [uploadRow] = await db
      .insert(uploads)
      .values({ ownerId: user.id, blobKey: key, contentType: mime, byteSize: file.size, status: "pending" })
      .returning();
  } catch (err) {
    console.error("[uploads] insert failed:", err);
    throw new ApiError(500, `Could not record upload: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Run vision extraction.
  try {
    const payload = await processUpload(user.id, uploadRow, (form.get("accountId") as string | null) || null);
    return json(payload);
  } catch (err) {
    console.error("[uploads] processUpload failed:", err);
    throw new ApiError(422, err instanceof Error ? err.message : "Extraction failed");
  }
});
