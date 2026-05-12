/**
 * Screenshot → structured transaction extraction (Layer 7). One-shot vision call
 * (no tool loop): the Qwen vision model looks at an uploaded transaction
 * screenshot/receipt and returns structured fields. The user reviews & corrects
 * before anything is saved.
 *
 * Pakistani bank/fintech apps are mostly digital and have a limited set of clean
 * layouts, so a vision model is quite accurate here — but it WILL sometimes miss
 * the transaction id, so we flag that and ask the user.
 *
 * Server-only.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { visionModel } from "./llm";

// One extracted transaction. Amounts are positive; `direction` carries the sign.
export const extractedTxnSchema = z.object({
  amount: z.number().describe("transaction amount, positive number, no currency symbol"),
  currency: z
    .string()
    .describe("ISO currency code if shown (PKR, USD, EUR…) or USDT/USDC for stablecoins; best guess from context"),
  direction: z.enum(["in", "out"]).describe("'in' if money was received/credited, 'out' if sent/debited"),
  txnType: z
    .enum(["income", "expense", "transfer", "investment"])
    .describe(
      "Classify carefully: 'expense' = paying a merchant/vendor/person/bill (DEFAULT for most outgoing payments); 'income' = receiving salary/freelance/business/remittance/crypto income; 'transfer' = ONLY when the money is clearly moving between two of the user's OWN accounts (e.g. bank→wallet, exchange withdrawal to own bank) — NOT a payment to someone else; 'investment' = buying an asset (stock, crypto, gold). When unsure between expense and transfer, choose 'expense'.",
    ),
  counterparty: z.string().nullable().describe("merchant / sender / receiver / payee name as shown, or null"),
  category: z.string().nullable().describe("short free-text category, e.g. 'groceries', 'client payment', 'rent', or null"),
  externalId: z
    .string()
    .nullable()
    .describe("the bank/fintech transaction reference / ID number shown on the receipt, exactly as printed; null if not visible"),
  occurredAt: z
    .string()
    .nullable()
    .describe("transaction date/time in ISO 8601 if shown (e.g. '2026-05-10T14:30:00'); null if not visible"),
  confidence: z.number().min(0).max(1).describe("your confidence (0..1) that these fields are correct"),
});

export const extractionResultSchema = z.object({
  detectedInstitution: z
    .string()
    .nullable()
    .describe("the bank / fintech app / exchange this screenshot is from, inferred from branding/UI (e.g. 'Meezan Bank', 'JazzCash', 'Payoneer', 'Binance'); null if unclear"),
  transactions: z
    .array(extractedTxnSchema)
    .describe("the transaction(s) visible in the screenshot — usually 1; could be a list. If you see a running list, extract each row."),
  notes: z.string().nullable().describe("anything notable / uncertain about this screenshot, or null"),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type ExtractedTxn = z.infer<typeof extractedTxnSchema>;

const SYSTEM = `
You extract transaction data from screenshots/receipts of banking and fintech apps,
especially Pakistani ones (Meezan, HBL, UBL, MCB, Bank Alfalah, JazzCash, Easypaisa,
SadaPay, NayaPay) and international fintech (Payoneer, Wise) and crypto exchanges
(Binance). The user uploads a screenshot; you return ONLY the structured fields.

Rules:
- Amounts are positive numbers, no thousands separators, no currency symbols.
- direction: "in" = received/credited to the user; "out" = sent/debited from the user.
- Infer currency from the symbol/code shown ("Rs"/"PKR" → PKR, "$" near a USD account → USD,
  USDT/USDC for stablecoins). If genuinely unclear, make your best guess and lower confidence.
- externalId: copy the transaction reference / TID / receipt number EXACTLY as printed.
  If it's not visible, set it to null (do NOT invent one).
- occurredAt: if a date/time is shown, output ISO 8601; otherwise null.
- If the screenshot shows a list of multiple transactions, return one object per row.
- Be conservative with confidence: 0.9+ only when everything is clearly legible.
`.trim();

/**
 * Extract from raw image bytes. `contentType` should be the image's MIME type
 * (image/png, image/jpeg, …) — defaults to image/png.
 */
export async function extractFromImage(
  bytes: Uint8Array,
  contentType = "image/png",
): Promise<ExtractionResult> {
  const { object } = await generateObject({
    model: visionModel(),
    schema: extractionResultSchema,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the transaction(s) from this screenshot." },
          { type: "image", image: bytes, mediaType: contentType },
        ],
      },
    ],
  });
  return object;
}
