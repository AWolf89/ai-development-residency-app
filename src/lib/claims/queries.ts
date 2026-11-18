/**
 * Thin, read-only data access for claims (ADR-0015). A claim is a `decision_records` row read
 * with its embedded relations; this is a Humble Object (no business logic) used by the profile
 * Server Component. Row-Level Security guarantees each query returns only the signed-in user's
 * own rows, which is why it takes an already-authenticated server client. The mapping from rows
 * to `Claim` lives in the pure `assemble.ts` (tested in vitest); this file only fetches.
 */
import type { createClient } from "@/lib/supabase/server";
import { toClaims } from "./assemble";
import type { Claim, ClaimRecordRow } from "./types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// decision_records + the relations a claim projects over. Each embedded table has a single FK
// into decision_records (decision_record_id), so the embeds are unambiguous and RLS-scoped.
const CLAIM_SELECT =
  "id, title, decision, category, is_metric, created_at, updated_at, " +
  "evidence_links ( file_id ), " +
  "record_versions ( version_number, created_at ), " +
  "record_requirement_links ( id ), " +
  "interview_turns ( id )";

/** Raw confirmed-record rows for the signed-in user, newest-updated first (RLS-scoped). */
export async function getClaimRows(
  supabase: ServerClient,
  userId: string
): Promise<ClaimRecordRow[]> {
  const { data } = await supabase
    .from("decision_records")
    .select(CLAIM_SELECT)
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .order("updated_at", { ascending: false });

  return (data ?? []) as unknown as ClaimRecordRow[];
}

/** The signed-in user's claims, assembled from their confirmed decision records. */
export async function getClaims(
  supabase: ServerClient,
  userId: string
): Promise<Claim[]> {
  return toClaims(await getClaimRows(supabase, userId));
}
