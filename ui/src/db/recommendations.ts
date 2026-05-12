/**
 * Recommendation query helpers — list and status updates (the status feeds the
 * future learning loop, Layer 9).
 */
import { desc, eq } from "drizzle-orm";
import { db } from "./index";
import { recommendations, type Recommendation } from "./schema";

export type RecStatus = "new" | "acted" | "dismissed" | "snoozed";
export const REC_STATUSES: RecStatus[] = ["new", "acted", "dismissed", "snoozed"];

export async function listRecommendations(limit = 50): Promise<Recommendation[]> {
  return db.select().from(recommendations).orderBy(desc(recommendations.createdAt)).limit(limit);
}

export async function getRecommendation(id: string): Promise<Recommendation | undefined> {
  const rows = await db.select().from(recommendations).where(eq(recommendations.id, id)).limit(1);
  return rows[0];
}

export async function updateRecommendationStatus(
  id: string,
  status: RecStatus,
  opts?: { snoozedUntil?: Date | null; outcomeNote?: string | null },
): Promise<Recommendation | undefined> {
  const set: Record<string, unknown> = { status, updatedAt: new Date() };
  if (status === "snoozed") set.snoozedUntil = opts?.snoozedUntil ?? new Date(Date.now() + 7 * 24 * 3600_000);
  else set.snoozedUntil = null;
  if (opts?.outcomeNote !== undefined) set.outcomeNote = opts.outcomeNote;
  const rows = await db.update(recommendations).set(set).where(eq(recommendations.id, id)).returning();
  return rows[0];
}
