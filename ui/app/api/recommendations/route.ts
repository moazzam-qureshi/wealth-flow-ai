import { handler, json, requireApiUser } from "@/src/lib/api";
import { listRecommendations } from "@/src/db/recommendations";

export const GET = handler(async () => {
  await requireApiUser();
  const recs = await listRecommendations();
  return json({
    recommendations: recs.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      reasoning: r.reasoning,
      grounding: r.groundingJson,
      status: r.status,
      snoozedUntil: r.snoozedUntil?.toISOString() ?? null,
      outcomeNote: r.outcomeNote,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});
