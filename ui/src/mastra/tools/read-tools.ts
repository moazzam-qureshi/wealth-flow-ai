/**
 * Read-only tools the chat agent uses to ground its answers in the *signed-in
 * user's* actual data. Deliberately read-only — writes (saving transactions,
 * updating balances) happen via the Next.js API layer so they're auditable, not
 * via agent tools.
 *
 * Multi-tenant: tools don't take an ownerId argument from the model — instead the
 * caller builds them with `makeReadTools(ownerId)`, closing the user id into each
 * tool's `execute`. So the model can never read another user's data, and there's
 * no per-call plumbing through Mastra's stream layer to get wrong.
 *
 * All return plain JSON-serializable objects.
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { transactions, newsItems, recommendations } from "../../db/schema";
import { listAccounts } from "../../db/accounts";
import { getProfileNormalized } from "../../db/profile";
import { computeMetrics } from "../../db/cashflow";

export function makeReadTools(ownerId: string) {
  const getAccountsTool = createTool({
    id: "get-accounts",
    description:
      "List the user's financial accounts (banks, fintech apps, exchanges, wallets, cash) with current balances. This is the user's 'financial reality map'.",
    inputSchema: z.object({
      includeArchived: z.boolean().optional().describe("include archived accounts too"),
    }),
    execute: async (input) => {
      const accounts = await listAccounts(ownerId, { includeArchived: input.includeArchived });
      return {
        accounts: accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          currency: a.currency,
          institution: a.institution,
          balance: a.currentBalance,
          archived: !!a.archived,
          lastReconciledAt: a.lastReconciledAt?.toISOString() ?? null,
        })),
      };
    },
  });

  const getMetricsTool = createTool({
    id: "get-metrics",
    description:
      "Compute the user's current financial metrics: net worth (in USD and home currency, at interbank and open-market FX rates), the USD↔home-currency spread, currency exposure %, and cashflow (monthly income, burn, savings, runway) over a window. Deterministic — these are the real numbers, not estimates.",
    inputSchema: z.object({
      windowDays: z.number().optional().describe("cashflow window in days (default 90)"),
    }),
    execute: async (input) => {
      return computeMetrics(ownerId, { windowDays: input.windowDays });
    },
  });

  const getRecentTransactionsTool = createTool({
    id: "get-recent-transactions",
    description: "List the user's most recent confirmed transactions (newest first).",
    inputSchema: z.object({
      limit: z.number().min(1).max(100).optional().describe("how many (default 30)"),
    }),
    execute: async (input) => {
      const rows = await db
        .select()
        .from(transactions)
        .where(and(eq(transactions.ownerId, ownerId), eq(transactions.status, "confirmed")))
        .orderBy(desc(transactions.occurredAt))
        .limit(input.limit ?? 30);
      return {
        transactions: rows.map((t) => ({
          id: t.id,
          accountId: t.accountId,
          amount: t.amount,
          currency: t.currency,
          direction: t.direction,
          type: t.txnType,
          counterparty: t.counterparty,
          category: t.category,
          occurredAt: t.occurredAt.toISOString(),
          isTransfer: !!t.transferLinkId,
        })),
      };
    },
  });

  const getRecentNewsTool = createTool({
    id: "get-recent-news",
    description:
      "List recent curated macro/economic news items (with a one-line note on how each affects a user like this one). Use this to ground suggestions in what's actually happening. News is shared across users — it's market context, not personal data.",
    inputSchema: z.object({
      limit: z.number().min(1).max(50).optional().describe("how many (default 15)"),
      onlyRelevant: z.boolean().optional().describe("only items judged to affect the user"),
    }),
    execute: async (input) => {
      const rows = await db
        .select()
        .from(newsItems)
        .orderBy(desc(newsItems.publishedAt))
        .limit(input.limit ?? 15);
      const filtered = input.onlyRelevant ? rows.filter((n) => n.exposureNote) : rows;
      return {
        news: filtered.map((n) => ({
          id: n.id,
          source: n.source,
          url: n.url,
          title: n.title,
          summary: n.summary,
          tags: n.relevanceTags,
          exposureNote: n.exposureNote,
          publishedAt: n.publishedAt?.toISOString() ?? null,
        })),
      };
    },
  });

  const getProfileTool = createTool({
    id: "get-profile",
    description:
      "Get the user's profile and CAPABILITY GRAPH — what they can realistically do financially (invest in US/international stocks, invest in the local stock market, hold foreign currency, hold stablecoins, move money internationally, receive cross-border income, retirement accounts), the payment rails they use, plus geography, home currency, display-currency preference, and free-text notes. Each capability is 'yes' | 'no' | 'unknown'. ALWAYS call this before reasoning about what the user can do — never assume. If a capability is 'unknown', do not guess: ask the user (in chat) or explicitly flag the uncertainty (in a suggestion).",
    inputSchema: z.object({}),
    execute: async () => {
      const p = await getProfileNormalized(ownerId);
      return {
        geography: p.geography || "(not recorded)",
        homeCurrency: p.homeCurrency,
        displayCurrency: p.displayCurrencyPref,
        capabilityGraph: p.capabilityGraph, // { usStockMarket: 'yes'|'no'|'unknown', usStockMarketVia, localStockMarket, holdsForeignCurrency, holdsStablecoins, movesMoneyInternationally, receivesCrossBorderIncome, retirementAccounts, paymentRails: [...], notes }
        preferences: p.preferencesJson,
      };
    },
  });

  const getRecommendationsTool = createTool({
    id: "get-recommendations",
    description:
      "List recent financial-leverage suggestions the system has made to this user, with their status (new/acted/dismissed/snoozed). Useful so the agent doesn't repeat itself and can see what the user engaged with.",
    inputSchema: z.object({
      limit: z.number().min(1).max(50).optional().describe("how many (default 10)"),
    }),
    execute: async (input) => {
      const rows = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.ownerId, ownerId))
        .orderBy(desc(recommendations.createdAt))
        .limit(input.limit ?? 10);
      return {
        recommendations: rows.map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body,
          reasoning: r.reasoning,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          outcomeNote: r.outcomeNote,
        })),
      };
    },
  });

  return {
    getAccountsTool,
    getMetricsTool,
    getRecentTransactionsTool,
    getRecentNewsTool,
    getProfileTool,
    getRecommendationsTool,
  };
}

export type ReadTools = ReturnType<typeof makeReadTools>;
