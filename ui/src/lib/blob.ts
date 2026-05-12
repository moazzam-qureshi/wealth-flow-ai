/**
 * Blob storage for uploaded screenshots/receipts. Uses SeaweedFS (S3-compatible)
 * when `SEAWEEDFS_S3_ENDPOINT` is configured (production); otherwise falls back to
 * the local filesystem under `./.data/uploads/` (dev).
 *
 * Server-only.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { env } from "./env";

function useS3(): boolean {
  return Boolean(env.SEAWEEDFS_S3_ENDPOINT);
}

// ── S3 (SeaweedFS) path ──────────────────────────────────────────────────────

const g = globalThis as unknown as { __wealthflowS3?: S3Client };

function s3(): S3Client {
  if (g.__wealthflowS3) return g.__wealthflowS3;
  g.__wealthflowS3 = new S3Client({
    region: env.SEAWEEDFS_S3_REGION,
    endpoint: env.SEAWEEDFS_S3_ENDPOINT!,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.SEAWEEDFS_S3_ACCESS_KEY ?? "",
      secretAccessKey: env.SEAWEEDFS_S3_SECRET_KEY ?? "",
    },
  });
  return g.__wealthflowS3;
}

async function ensureBucket() {
  const Bucket = env.SEAWEEDFS_BUCKET;
  try {
    await s3().send(new HeadBucketCommand({ Bucket }));
  } catch {
    try {
      await s3().send(new CreateBucketCommand({ Bucket }));
    } catch {
      /* race / already exists — a later PutObject surfaces real errors */
    }
  }
}

// ── filesystem fallback ──────────────────────────────────────────────────────

function fsRoot(): string {
  return path.resolve(process.cwd(), ".data", "uploads");
}
function fsPath(key: string): string {
  // keys look like "2026/05/<uuid>.png" — keep the structure under the root
  return path.join(fsRoot(), key.replace(/^\/+/, ""));
}

// ── public API ───────────────────────────────────────────────────────────────

/** Generate a storage key for a new upload. */
export function makeBlobKey(ext: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const id = crypto.randomUUID();
  const cleanExt = ext.replace(/^\./, "").toLowerCase() || "bin";
  return `${yyyy}/${mm}/${id}.${cleanExt}`;
}

export async function putBlob(key: string, body: Uint8Array, contentType?: string): Promise<void> {
  if (useS3()) {
    await ensureBucket();
    await s3().send(
      new PutObjectCommand({ Bucket: env.SEAWEEDFS_BUCKET, Key: key, Body: body, ContentType: contentType }),
    );
    return;
  }
  const p = fsPath(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, body);
}

export async function getBlob(key: string): Promise<{ bytes: Uint8Array; contentType?: string }> {
  if (useS3()) {
    const res = await s3().send(new GetObjectCommand({ Bucket: env.SEAWEEDFS_BUCKET, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return { bytes, contentType: res.ContentType };
  }
  const bytes = new Uint8Array(await fs.readFile(fsPath(key)));
  return { bytes };
}
