/**
 * Thin, read-only data access for stored gap assessments.
 *
 * A humble query wrapper used by the Gap Check Server Component. RLS guarantees it only
 * returns the signed-in user's own rows (own-rows policy, ADR-0011), so it takes an
 * authenticated server client.
 */
import type { createClient } from "@/lib/supabase/server";
import type { GapVerdict } from "./types";
import type { Citation } from "@/lib/rag/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type AssessmentItem = {
  role_requirement_id: string;
  verdict: GapVerdict;
  rationale: string;
  citations: Citation[];
  evidence_found: boolean;
  updated_at: string;
};

/** The saved gap assessments for one target role (RLS-scoped to the owner). */
export async function getAssessmentsForRole(
  supabase: ServerClient,
  targetRoleId: string
): Promise<AssessmentItem[]> {
  const { data } = await supabase
    .from("requirement_gap_assessments")
    .select(
      "role_requirement_id, verdict, rationale, citations, evidence_found, updated_at"
    )
    .eq("target_role_id", targetRoleId);
  return (data ?? []) as AssessmentItem[];
}
