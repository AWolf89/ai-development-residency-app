/**
 * Thin, read-only data access for claims (ADR-0015, ADR-0022). A claim is a `claims` row read
 * with its backing `decision_records` embedded through `claim_evidence`; this is a Humble
 * Object (no business logic) used by the profile Server Component. Row-Level Security
 * guarantees each query returns only the signed-in user's own rows, which is why it takes an
 * already-authenticated server client. The mapping from rows to `Claim` lives in the pure
 * `assemble.ts` (tested in vitest); this file only fetches.
 */
import type { createClient } from "@/lib/supabase/server";
import { toClaims } from "./assemble";
import type { Claim, ClaimRow } from "./types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// claims + the backing decision record (and the relations a claim projects over), joined
// through claim_evidence. Each embed is RLS-scoped and has a single FK, so the path is
// unambiguous: claims → claim_evidence → decision_records → {evidence_links, record_versions,
// record_requirement_links, interview_turns, record_reviews → record_review_flags}.
const CLAIM_SELECT =
  "id, status, created_at, updated_at, " +
  "claim_evidence ( " +
  "decision_records ( " +
  "id, title, decision, category, is_metric, created_at, updated_at, " +
  "evidence_links ( file_id ), " +
  "record_versions ( version_number, created_at ), " +
  "record_requirement_links ( id ), " +
  "interview_turns ( id ), " +
  "record_reviews ( record_review_flags ( disposition ) ) " +
  ") )";

/** Raw claim rows for the signed-in user, newest-updated first (RLS-scoped). */
export async function getClaimRows(
  supabase: ServerClient,
  userId: string
): Promise<ClaimRow[]> {
  const { data } = await supabase
    .from("claims")
    .select(CLAIM_SELECT)
    .eq("user_id", userId)
    // Archived claims are retired from the active profile (ADR-0022 §3).
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  return (data ?? []) as unknown as ClaimRow[];
}

/** The signed-in user's active claims, assembled from their backing decision records. */
export async function getClaims(
  supabase: ServerClient,
  userId: string
): Promise<Claim[]> {
  return toClaims(await getClaimRows(supabase, userId));
}
