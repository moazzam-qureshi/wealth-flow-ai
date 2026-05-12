import { desc } from "drizzle-orm";
import { db } from "@/src/db";
import { newsItems } from "@/src/db/schema";
import { Card, SectionLabel } from "../_components/ui";

export const dynamic = "force-dynamic";

// "News" — curated macro / PKR / freelance / crypto. Items that touch your situation
// come first (warm tint + the exposure note). Informational — grounding for the
// weekly ideas, not advice.
export default async function NewsScreen() {
  const items = await db.select().from(newsItems).orderBy(desc(newsItems.publishedAt)).limit(60);
  const affecting = items.filter((i) => i.exposureNote);
  const rest = items.filter((i) => !i.exposureNote);

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-4 pt-5 pb-8 md:max-w-lg md:px-6 md:pt-7">
      <div className="wf-rise">
        <h1 className="font-display text-xl font-semibold tracking-tight">News</h1>
        <p className="mt-1 text-[13px] text-[var(--fg-mut)]">
          What&apos;s moving that touches your money. Items flagged below plausibly affect you. Not advice.
        </p>
      </div>

      {items.length === 0 && (
        <Card className="wf-rise p-6 text-center text-[13px] text-[var(--fg-mut)]">
          No news yet. The <code className="text-[var(--fg-dim)]">cron/fetch-news</code> task pulls and analyzes the feeds — run it once or wait for the schedule.
        </Card>
      )}

      {affecting.length > 0 && (
        <section className="wf-rise" style={{ animationDelay: "60ms" }}>
          <SectionLabel>Affects you · {affecting.length}</SectionLabel>
          <ul className="space-y-2.5">
            {affecting.map((n, idx) => (
              <li key={n.id}>
                <Card glow className="wf-rise border-[rgba(245,185,66,0.28)] bg-[linear-gradient(180deg,rgba(245,185,66,0.05),transparent)] p-4" style={{ animationDelay: `${80 + idx * 40}ms` }}>
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-[14px] font-medium text-[var(--fg)] hover:underline">{n.title}</a>
                  <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-[var(--amber)]">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--amber)]" />
                    <span>{n.exposureNote}</span>
                  </p>
                  {n.summary && <p className="mt-1.5 text-[12px] text-[var(--fg-mut)]">{n.summary}</p>}
                  <Meta source={n.source} publishedAt={n.publishedAt} tags={n.relevanceTags} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rest.length > 0 && (
        <section className="wf-rise" style={{ animationDelay: "120ms" }}>
          <SectionLabel>Other headlines</SectionLabel>
          <Card className="divide-y divide-[var(--line-soft)]">
            {rest.map((n) => (
              <div key={n.id} className="px-4 py-2.5">
                <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-[var(--fg-dim)] hover:text-[var(--fg)] hover:underline">{n.title}</a>
                {n.summary && <p className="mt-0.5 text-[11px] text-[var(--fg-faint)]">{n.summary}</p>}
                <Meta source={n.source} publishedAt={n.publishedAt} tags={n.relevanceTags} />
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

function Meta({ source, publishedAt, tags }: { source: string; publishedAt: Date | null; tags: unknown }) {
  const t = Array.isArray(tags) ? (tags as string[]) : [];
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-[var(--fg-faint)]">
      <span>{source}</span>
      {publishedAt && <span>· {new Date(publishedAt).toLocaleDateString()}</span>}
      {t.slice(0, 5).map((tag) => (
        <span key={tag} className="rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-[var(--fg-mut)]">{tag}</span>
      ))}
    </div>
  );
}
