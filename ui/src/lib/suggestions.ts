/**
 * Weekly grounded leverage suggestions (Layer 8). Assembles a structured snapshot
 * of the user's situation — accounts, deterministic metrics, recent transactions,
 * recent relevant news, profile/capability graph, and prior recommendations + their
 * statuses — and asks the strategist (Qwen text) for 1–3 suggestions. Each MUST
 * carry its reasoning and explicit grounding (which numbers / news it's based on)
 * so the user can judge it. Stored in `recommendations`.
 *
 * Framing throughout: financial-leverage IDEAS grounded in real data — NOT advice.
 *
 * Triggered by POST /api/cron/weekly-suggestions.
 *
 * Server-only.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { db } from "../db";
import { recommendations, transactions, newsItems } from "../db/schema";
import { listAccounts } from "../db/accounts";
import { getProfileNormalized } from "../db/profile";
import { computeMetrics } from "../db/cashflow";
import { textModel } from "../mastra/llm";

const suggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        title: z.string().describe("short, concrete title (≤ 80 chars), e.g. 'Shift ~$1,500 of idle PKR into USDT'"),
        body: z
          .string()
          .describe("the suggestion itself — what to consider doing and why it's leverage for THIS user, 2–4 sentences. Concrete, not generic."),
        reasoning: z
          .string()
          .describe("the chain of reasoning: which specific numbers and constraints lead here, what the trade-offs are, and where the uncertainty is. The user reads this to judge validity."),
        grounding: z.object({
          metrics: z.array(z.string()).describe("which metrics this rests on, e.g. ['net worth $X', 'PKR exposure 60%', 'runway 4 months']"),
          newsItemIds: z.array(z.string()).describe("ids of news_items this draws on (from the list provided), or empty"),
          accountIds: z.array(z.string()).describe("ids of accounts this is about, or empty"),
        }),
        confidence: z.enum(["low", "medium", "high"]).describe("how confident you are this is genuinely high-leverage and well-grounded"),
      }),
    )
    .min(1)
    .max(3),
  noSuggestionsReason: z.string().nullable().describe("if you genuinely have no good grounded suggestion (e.g. too little data), say why here and return an empty suggestions array — but only as a last resort"),
});

export type WeeklySuggestionResult = { created: number; reason: string | null };

const SYSTEM = `
You are the financial strategist inside WealthFlow. Once a week you look at one
user's actual situation and surface 1–3 grounded financial-LEVERAGE ideas — the
highest-impact moves available to THIS user within their real constraints.

This user is internet-native and operates in a hybrid / emerging-market reality
(e.g. a freelancer holding a local currency under inflation + USD via fintech rails
+ stablecoins). Do not assume a clean Western financial system. Do not give generic
internet-finance advice ("just save more", "build a 6-month emergency fund") —
ground everything in their numbers.

Hard rules:
- GROUND every suggestion in the data provided. Cite the specific metrics / news /
  accounts in the "grounding" field. Never invent numbers.
- NEVER ASSUME what the user can or can't do financially. Use ONLY the
  capabilityGraph in the snapshot — each capability is 'yes' | 'no' | 'unknown'.
  Geography does NOT imply access (a Pakistan-based user may well be able to invest
  in US stocks via IBKR, hold foreign currency, move money internationally, etc.).
  If a capability you'd rely on is 'unknown', either (a) don't make that suggestion,
  or (b) make it but explicitly caveat it in the reasoning ("this assumes you can
  access international markets — set that on your Profile if so") and lower the
  confidence. Never silently assume 'no'.
- SHOW REASONING. The "reasoning" field must walk through *why* — which figures and
  constraints lead there, the trade-offs, and where you're uncertain. Be honest
  about uncertainty.
- This is NOT financial advice. These are ideas grounded in their data; the user
  decides. Don't be preachy or moralize about their behavior.
- Think in LEVERAGE: for one user the best move is raising freelance rates; for
  another, preserving purchasing power by shifting out of an inflating currency; for
  another, stabilizing cashflow or improving emergency liquidity. Pick what actually
  moves THIS user's trajectory most.
- Don't repeat suggestions the user recently dismissed (you'll see prior ones). If a
  prior suggestion was acted on, you can build on it.
- If the data is too thin to say anything useful (e.g. no transactions yet, no FX
  rates), prefer 1 modest, clearly-caveated suggestion over silence — and only set
  "noSuggestionsReason" as a true last resort.
- 1–3 suggestions, ordered by leverage. Concrete titles. No fluff.
`.trim();

export async function generateWeeklySuggestions(): Promise<WeeklySuggestionResult> {
  const [accounts, metrics, profile, recentTxns, recentNews, priorRecs] = await Promise.all([
    listAccounts(),
    computeMetrics(),
    getProfileNormalized(),
    db.select().from(transactions).orderBy(desc(transactions.occurredAt)).limit(40),
    db.select().from(newsItems).orderBy(desc(newsItems.publishedAt)).limit(25),
    db.select().from(recommendations).orderBy(desc(recommendations.createdAt)).limit(15),
  ]);

  const snapshot = {
    profile: {
      geography: profile.geography || "(not recorded)",
      homeCurrency: profile.homeCurrency,
      displayCurrency: profile.displayCurrencyPref,
      // capabilityGraph: each is 'yes' | 'no' | 'unknown'. Treat 'unknown' as "ask / caveat", never as 'no'.
      capabilityGraph: profile.capabilityGraph,
      preferences: profile.preferencesJson,
    },
    metrics,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, currency: a.currency, institution: a.institution, balance: a.currentBalance, lastReconciledAt: a.lastReconciledAt?.toISOString() ?? null })),
    recentTransactions: recentTxns.map((t) => ({ id: t.id, accountId: t.accountId, amount: t.amount, currency: t.currency, direction: t.direction, type: t.txnType, counterparty: t.counterparty, category: t.category, occurredAt: t.occurredAt.toISOString(), isTransfer: !!t.transferLinkId })),
    recentNews: recentNews.map((n) => ({ id: n.id, title: n.title, summary: n.summary, tags: n.relevanceTags, exposureNote: n.exposureNote, publishedAt: n.publishedAt?.toISOString() ?? null })),
    priorRecommendations: priorRecs.map((r) => ({ id: r.id, title: r.title, status: r.status, createdAt: r.createdAt.toISOString() })),
  };

  const { object } = await generateObject({
    model: textModel(),
    schema: suggestionSchema,
    system: SYSTEM,
    prompt: `Here is the user's current situation as structured JSON. Produce 1–3 grounded leverage suggestions per the rules.\n\n${JSON.stringify(snapshot, null, 2)}`,
  });

  let created = 0;
  for (const s of object.suggestions) {
    await db.insert(recommendations).values({
      title: s.title.slice(0, 200),
      body: s.body,
      reasoning: s.reasoning,
      groundingJson: { ...s.grounding, confidence: s.confidence } as never,
      status: "new",
    });
    created++;
  }
  return { created, reason: object.noSuggestionsReason ?? null };
}
