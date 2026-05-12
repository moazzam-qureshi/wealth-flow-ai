/**
 * News ingestion (Layer 3, v1). Pulls the curated free RSS feeds, takes recent
 * items not seen before, and runs them through the LLM to get: a short summary,
 * relevance tags, and a one-line "how this affects you" note keyed off the user's
 * profile (geography, currencies, capability graph). Informational only — this
 * never auto-fires "do X now" advice; the weekly-suggestions agent reads it as
 * grounding context.
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
import { getProfileNormalized } from "../db/profile";
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
      affectsUser: z.boolean().describe("does this plausibly affect THIS user's financial situation?"),
      exposureNote: z
        .string()
        .nullable()
        .describe("if affectsUser, ONE short sentence on *how* it affects them given their profile (e.g. 'PKR devaluation pressure → your local-currency savings lose purchasing power'); null if not relevant"),
    }),
  ),
});

export async function fetchAndStoreNews(): Promise<{ pulled: number; new: number; analyzed: number }> {
  const profile = await getProfileNormalized();
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

  const profileBlurb = `User profile: geography=${profile.geography || "(not recorded)"}, home currency=${profile.homeCurrency}, display currency=${profile.displayCurrencyPref}. Capability graph (each: yes|no|unknown — treat 'unknown' as 'maybe', not 'no'): ${JSON.stringify(profile.capabilityGraph)}. They are an internet-native freelancer/remote worker operating in a hybrid / emerging-market financial reality. Do NOT assume their access from geography — use the capability graph.`;

  const { object } = await generateObject({
    model: textModel(),
    schema: analysisSchema,
    system:
      "You filter macro/economic news for relevance to a specific person and write a one-line 'how this affects you' note. Be conservative: most news does NOT meaningfully affect them — set affectsUser=false and exposureNote=null in that case. Only flag things that touch their currencies, their cross-border payment rails, the freelance/remote economy, crypto regulation where they operate, or major shocks (devaluation, sanctions, banking restrictions, inflation moves).",
    prompt: `${profileBlurb}\n\nHere are recent news items. For EACH, return a summary, relevance tags, whether it affects this user, and (if so) a one-line exposure note.\n\n${fresh
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
