/**
 * Thin, read-only data access for a user's learning moments (ADR-0018).
 *
 * A humble query wrapper (no business logic) used by the Gap Check Server Component to surface
 * learning-agility evidence beside true gaps. Row-Level Security guarantees it only returns the
 * signed-in user's own rows (own-rows policy — AC4), so it takes an authenticated server client.
 * The relevance/ordering decision is the pure `selectGapLearningEvidence` (gap-evidence.ts).
 */
import type { createClient } from "@/lib/supabase/server";
import type { LearningMomentRecord } from "./gap-evidence";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const LEARNING_MOMENT_COLUMNS =
  "id, kind, context, shift, result, duration, target_role_id, created_at";

/** All of the signed-in user's learning moments, newest first (RLS-scoped to the owner). */
export async function getLearningMoments(
  supabase: ServerClient,
  userId: string
): Promise<LearningMomentRecord[]> {
  const { data } = await supabase
    .from("learning_moments")
    .select(LEARNING_MOMENT_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as LearningMomentRecord["kind"],
    context: row.context as string,
    shift: row.shift as string,
    result: row.result as string,
    duration: (row.duration as string | null) ?? null,
    targetRoleId: (row.target_role_id as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}
