/**
 * Thin, read-only data access for record reviews and their flags (Reviewer Agent Check, ADR-0016).
 *
 * These are humble query wrappers (no business logic) used by Server Components and to rehydrate
 * "is this record reviewed?" status. Row-Level Security guarantees each query only returns the
 * signed-in user's own rows, which is why they take an already-authenticated server client.
 */
import type { createClient } from "@/lib/supabase/server";
import type { Citation } from "@/lib/rag/types";
import type {
  FlagDisposition,
  FlagSeverity,
  ReviewDimension,
  ReviewTargetField,
} from "./types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type ReviewStatusRow = "active" | "paused" | "complete" | "discarded";

export type RecordReviewRow = {
  id: string;
  user_id: string;
  decision_record_id: string;
  status: ReviewStatusRow;
  check_budget: number;
  checks_done: number;
  created_at: string;
  updated_at: string;
};

export type RecordReviewFlagRow = {
  id: string;
  review_id: string;
  user_id: string;
  dimension: ReviewDimension;
  severity: FlagSeverity;
  target_field: ReviewTargetField;
  message: string;
  citations: Citation[];
  disposition: FlagDisposition;
  model_used: string | null;
  prompt_version: string | null;
  created_at: string;
};

const REVIEW_COLUMNS =
  "id, user_id, decision_record_id, status, check_budget, checks_done, created_at, updated_at";
const FLAG_COLUMNS =
  "id, review_id, user_id, dimension, severity, target_field, message, citations, disposition, model_used, prompt_version, created_at";

/** One review by id (RLS scopes it to the owner). */
export async function getReviewById(
  supabase: ServerClient,
  id: string
): Promise<RecordReviewRow | null> {
  const { data } = await supabase
    .from("record_reviews")
    .select(REVIEW_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as RecordReviewRow | null) ?? null;
}

/** The most recent completed review for a record, if any — the source of "reviewed?" status. */
export async function getLatestCompleteReview(
  supabase: ServerClient,
  decisionRecordId: string
): Promise<RecordReviewRow | null> {
  const { data } = await supabase
    .from("record_reviews")
    .select(REVIEW_COLUMNS)
    .eq("decision_record_id", decisionRecordId)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as RecordReviewRow | null) ?? null;
}

/** All flags for a review, oldest first (RLS scopes to the owner). */
export async function getReviewFlags(
  supabase: ServerClient,
  reviewId: string
): Promise<RecordReviewFlagRow[]> {
  const { data } = await supabase
    .from("record_review_flags")
    .select(FLAG_COLUMNS)
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });
  return (data ?? []) as RecordReviewFlagRow[];
}

/** True when the record has a completed review (used to show a "reviewed" badge). */
export async function isRecordReviewed(
  supabase: ServerClient,
  decisionRecordId: string
): Promise<boolean> {
  return (await getLatestCompleteReview(supabase, decisionRecordId)) !== null;
}
