/**
 * Shared screenshot-ingestion logic used by both POST /api/uploads (direct upload)
 * and GET /api/uploads/[id] (a blob stashed by the Web Share Target). Given an
 * `uploads` row that already has its blob stored, this runs the vision extraction,
 * best-effort institution→account mapping, and dedup checks, then returns the
 * review payload the /upload page renders. Nothing is written to `transactions`.
 *
 * Server-only.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { uploads, type Upload } from "../db/schema";
import { getBlob } from "./blob";
import { extractFromImage } from "../mastra/extraction";
import { findByExternalId, type Direction, type TxnType } from "../db/transactions";
import { listAccounts } from "../db/accounts";

export type ReviewTxn = {
  amount: number;
  currency: string;
  direction: Direction;
  txnType: TxnType;
  counterparty: string | null;
  category: string | null;
  externalId: string | null;
  occurredAt: string | null;
  confidence: number;
  duplicateOf: string | null;
};

export type ReviewPayload = {
  uploadId: string;
  blobKey: string;
  detectedInstitution: string | null;
  suggestedAccountId: string | null;
  accounts: { id: string; name: string; currency: string; institution: string | null }[];
  transactions: ReviewTxn[];
  notes: string | null;
};

export async function processUpload(uploadRow: Upload, accountHint?: string | null): Promise<ReviewPayload> {
  if (uploadRow.contentType === "application/pdf") {
    await markFailed(uploadRow.id, "PDF extraction not supported yet — upload a screenshot image");
    throw new Error("PDF extraction not supported yet — upload a screenshot image");
  }

  const { bytes, contentType } = await getBlob(uploadRow.blobKey);
  let extraction;
  try {
    extraction = await extractFromImage(bytes, uploadRow.contentType ?? contentType ?? "image/png");
  } catch (err) {
    await markFailed(uploadRow.id, err instanceof Error ? err.message : String(err));
    throw err;
  }

  const allAccounts = await listAccounts();
  let accountId = accountHint || uploadRow.detectedAccountId || null;
  if (!accountId && extraction.detectedInstitution) {
    const needle = extraction.detectedInstitution.toLowerCase();
    const match = allAccounts.find(
      (a) =>
        (a.institution && needle.includes(a.institution.toLowerCase())) ||
        (a.institution && a.institution.toLowerCase().includes(needle)) ||
        a.name.toLowerCase().includes(needle),
    );
    if (match) accountId = match.id;
  }

  const reviewTxns: ReviewTxn[] = [];
  for (const t of extraction.transactions) {
    let duplicateOf: string | null = null;
    if (accountId && t.externalId) {
      const existing = await findByExternalId(accountId, t.externalId);
      duplicateOf = existing?.id ?? null;
    }
    reviewTxns.push({
      amount: t.amount,
      currency: t.currency,
      direction: t.direction,
      txnType: t.txnType,
      counterparty: t.counterparty,
      category: t.category,
      externalId: t.externalId,
      occurredAt: t.occurredAt,
      confidence: t.confidence,
      duplicateOf,
    });
  }

  await db
    .update(uploads)
    .set({
      status: "extracted",
      detectedInstitution: extraction.detectedInstitution,
      detectedAccountId: accountId,
      extractionRawJson: extraction as never,
      processedAt: new Date(),
    })
    .where(eq(uploads.id, uploadRow.id));

  return {
    uploadId: uploadRow.id,
    blobKey: uploadRow.blobKey,
    detectedInstitution: extraction.detectedInstitution,
    suggestedAccountId: accountId,
    accounts: allAccounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, institution: a.institution })),
    transactions: reviewTxns,
    notes: extraction.notes,
  };
}

async function markFailed(uploadId: string, error: string) {
  await db.update(uploads).set({ status: "failed", error, processedAt: new Date() }).where(eq(uploads.id, uploadId));
}
