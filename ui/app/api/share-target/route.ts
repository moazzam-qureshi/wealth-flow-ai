import { db } from "@/src/db";
import { uploads } from "@/src/db/schema";
import { makeBlobKey, putBlob } from "@/src/lib/blob";
import { getCurrentSession } from "@/src/lib/session";

// Web Share Target endpoint. The phone POSTs the shared image here as
// multipart/form-data. We stash it as an `uploads` row (status pending) and
// redirect to /upload?uploadId=… which then runs extraction. If not signed in,
// bounce to /login (the manifest scope is the whole app, so this can be hit
// before auth).
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export async function POST(req: Request) {
  const session = await getCurrentSession().catch(() => null);
  if (!session?.user) {
    return Response.redirect(new URL("/login?next=/upload", req.url), 303);
  }

  let uploadId: string | null = null;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (file instanceof File && file.size > 0 && file.size <= 12 * 1024 * 1024) {
      const mime = file.type || "image/png";
      const ext = EXT_BY_MIME[mime] ?? "bin";
      const bytes = new Uint8Array(await file.arrayBuffer());
      const key = makeBlobKey(ext);
      await putBlob(key, bytes, mime);
      const [row] = await db
        .insert(uploads)
        .values({ ownerId: session.user.id, blobKey: key, contentType: mime, byteSize: file.size, status: "pending" })
        .returning();
      uploadId = row.id;
    }
  } catch {
    // fall through — just open /upload empty
  }

  const dest = new URL("/upload", req.url);
  if (uploadId) {
    dest.searchParams.set("uploadId", uploadId);
    dest.searchParams.set("shared", "1");
  }
  return Response.redirect(dest, 303);
}
