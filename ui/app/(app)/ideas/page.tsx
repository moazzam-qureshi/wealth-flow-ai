import { listRecommendations } from "@/src/db/recommendations";
import { SuggestionsList, type ClientRec } from "./_components/suggestions-list";

export const dynamic = "force-dynamic";

// "Ideas" (Layer 8): 1–3 grounded financial-leverage ideas each week, each showing
// its reasoning and exactly which numbers / news it's based on. Not advice.
export default async function IdeasScreen() {
  const recs = await listRecommendations();
  const clientRecs: ClientRec[] = recs.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    reasoning: r.reasoning,
    grounding: r.groundingJson as Record<string, unknown>,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-4 pt-5 pb-8 md:max-w-lg md:px-6 md:pt-7">
      <div className="wf-rise">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-xl font-semibold tracking-tight">Ideas</h1>
          <span className="text-[11px] text-[var(--fg-faint)]">{recs.length} total</span>
        </div>
        <p className="mt-1 text-[13px] text-[var(--fg-mut)]">
          Leverage moves grounded in your real data — net worth, exposure, cashflow, recent
          transactions, current macro news. Each shows its reasoning. <span className="text-[var(--fg-dim)]">Not financial advice — your call.</span>
        </p>
      </div>
      <SuggestionsList initial={clientRecs} />
    </div>
  );
}
