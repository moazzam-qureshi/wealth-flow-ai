/**
 * News ingestion (Layer 3, v1). Pulls the curated free RSS feeds, takes recent
 * items not seen before, and runs them through the LLM to get: a short summary,
 * relevance tags, and a one-line "how this affects a user like ours" note. The
 * `news_items` table is GLOBAL (shared across users — it's market context, not
 * personal data), so the relevance note is written against the product's typical
 * audience (emerging-market / multi-currency freelancers & remote workers), not a
 * specific person's profile. Informational only — this never auto-fires "do X now"
 * advice; the weekly-suggestions agent reads it as grounding context per user.
 *
 * Triggered by POST /api/cron/fetch-news (Coolify scheduled task / manual).
 *
 * Server-only.
 */
import Parser from "rss-parser";
import { generateObject } from "ai";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { newsItems } from "../db/schema";
import { textModel } from "../mastra/llm";
import { RSS_FEEDS } from "./rss-feeds";

const parser = new Parser({ timeout: 15_000 });

// How many items per feed to consider, and total max to send to the LLM per run.
const PER_FEED = 8;
const MAX_PER_RUN = 30;

type RawItem = { source: string; area: string; title: string; url: string; publishedAt: Date | null; snippet: string };

async function pullFeeds(): Promise<RawItem[]> {
  const out: RawItem[] = [];
  await Promise.all(
    RSS_FEEDS.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        for (const item of (parsed.items ?? []).slice(0, PER_FEED)) {
          const url = (item.link ?? item.guid ?? "").trim();
          const title = (item.title ?? "").trim();
          if (!url || !title) continue;
          const ts = item.isoDate ?? item.pubDate;
          out.push({
            source: feed.name,
            area: feed.area,
            title,
            url,
            publishedAt: ts ? new Date(ts) : null,
            snippet: (item.contentSnippet ?? item.summary ?? "").slice(0, 600),
          });
        }
      } catch {
        // a flaky feed shouldn't kill the run
      }
    }),
  );
  return out;
}

const analysisSchema = z.object({
  items: z.array(
    z.object({
      url: z.string(),
      summary: z.string().describe("1–2 sentence neutral summary of the article"),
      relevanceTags: z
        .array(z.string())
        .describe("short tags like 'PKR', 'inflation', 'SBP', 'crypto-regulation', 'freelance', 'USD', 'remittances', 'sanctions', 'AI-industry' — only ones that genuinely apply"),
      affectsUser: z.boolean().describe("does this plausibly affect the financial situation of a typical user of this app (an emerging-market / multi-currency freelancer or remote worker)?"),
      exposureNote: z
        .string()
        .nullable()
        .describe("if affectsUser, ONE short sentence on *how* it affects such a user (e.g. 'PKR devaluation pressure → local-currency savings lose purchasing power'); null if not relevant"),
    }),
  ),
});

export async function fetchAndStoreNews(): Promise<{ pulled: number; new: number; analyzed: number }> {
  const raw = await pullFeeds();

  // dedup against what we already have
  const urls = raw.map((r) => r.url);
  const existing =
    urls.length > 0
      ? await db.select({ url: newsItems.url }).from(newsItems).where(inArray(newsItems.url, urls))
      : [];
  const known = new Set(existing.map((e) => e.url));
  // de-dupe within this pull too, keep newest-first, cap
  const seen = new Set<string>();
  const fresh = raw
    .filter((r) => !known.has(r.url) && !seen.has(r.url) && (seen.add(r.url), true))
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, MAX_PER_RUN);

  if (fresh.length === 0) return { pulled: raw.length, new: 0, analyzed: 0 };

  const audienceBlurb = `Audience: internet-native freelancers / remote workers in emerging or hybrid markets — typically holding a local currency under inflation pressure plus USD via fintech rails (Payoneer, Wise) and sometimes stablecoins (USDT/USDC), receiving cross-border income. Pakistan/PKR is the canonical case but not the only one. Don't assume any one person's exact access; write the note for this general profile.`;

  const { object } = await generateObject({
    model: textModel(),
    schema: analysisSchema,
    system:
      "You filter macro/economic news for relevance to a particular kind of user and write a one-line 'how this affects them' note. Be conservative: most news does NOT meaningfully affect them — set affectsUser=false and exposureNote=null in that case. Only flag things that touch their currencies, their cross-border payment rails, the freelance/remote economy, crypto regulation in markets they operate in, or major shocks (devaluation, sanctions, banking restrictions, inflation moves).",
    prompt: `${audienceBlurb}\n\nHere are recent news items. For EACH, return a summary, relevance tags, whether it affects this kind of user, and (if so) a one-line exposure note.\n\n${fresh
      .map((f, i) => `[${i + 1}] (${f.area}) ${f.title}\nURL: ${f.url}\n${f.snippet}`)
      .join("\n\n")}`,
  });

  const byUrl = new Map(object.items.map((it) => [it.url, it]));
  let inserted = 0;
  for (const f of fresh) {
    const a = byUrl.get(f.url);
    await db
      .insert(newsItems)
      .values({
        source: f.source,
        url: f.url,
        title: f.title,
        summary: a?.summary ?? f.snippet.slice(0, 200) ?? null,
        relevanceTags: (a?.relevanceTags ?? [f.area]) as never,
        exposureNote: a?.affectsUser ? a.exposureNote : null,
        publishedAt: f.publishedAt,
      })
      .onConflictDoNothing();
    inserted++;
  }
  return { pulled: raw.length, new: fresh.length, analyzed: object.items.length };
}
