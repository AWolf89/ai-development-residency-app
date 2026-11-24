import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getClaims } from "@/lib/claims/queries";
import type {
  InvestigationSignals,
  MissingInfoSignal,
  OverclaimFlagSignal,
  ReconciliationSignal,
  UnfinishedInterviewSignal,
  UnreviewedFileSignal,
  UnverifiedRequirementSignal,
  UnsupportedClaimSignal,
} from "./types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Humble read queries for the Investigation Queue (MVP 2 Phase 3, §8). Each collects one signal
// of "still outstanding" from a table that already carries its own status; Row-Level Security
// scopes every read to the signed-in owner (AC5). No writes — the queue is a projection, not a
// store. The pure assembler (build.ts) turns these into prioritised items.

/** Requirements the evidence can't yet verify: gap or unknown verdicts (with the requirement text). */
async function getUnverifiedRequirements(
  supabase: ServerClient
): Promise<UnverifiedRequirementSignal[]> {
  const { data } = await supabase
    .from("requirement_gap_assessments")
    .select(
      "role_requirement_id, target_role_id, verdict, updated_at, role_requirements(requirement_text)"
    )
    .in("verdict", ["gap", "unknown"]);

  type Row = {
    role_requirement_id: string;
    target_role_id: string;
    verdict: "gap" | "unknown";
    updated_at: string;
    role_requirements: { requirement_text: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    requirementId: r.role_requirement_id,
    targetRoleId: r.target_role_id,
    label: r.role_requirements?.requirement_text ?? "Requirement",
    verdict: r.verdict,
    updatedAt: r.updated_at,
  }));
}

/** Pending reviewer flags (overstated/unsupported claims), with the record they hang off. */
async function getOverclaimFlags(
  supabase: ServerClient
): Promise<OverclaimFlagSignal[]> {
  const { data } = await supabase
    .from("record_review_flags")
    .select(
      "id, message, created_at, record_reviews(decision_record_id, decision_records(title))"
    )
    .eq("disposition", "pending");

  type Row = {
    id: string;
    message: string;
    created_at: string;
    record_reviews: {
      decision_record_id: string;
      decision_records: { title: string } | null;
    } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.record_reviews?.decision_record_id)
    .map((r) => ({
      flagId: r.id,
      decisionRecordId: r.record_reviews!.decision_record_id,
      recordTitle: r.record_reviews!.decision_records?.title ?? "A record",
      message: r.message,
      createdAt: r.created_at,
    }));
}

/** Pending reconciliation findings (conflicts + complementary matches), with the file name. */
async function getReconciliation(
  supabase: ServerClient
): Promise<ReconciliationSignal[]> {
  const { data } = await supabase
    .from("reconciliation_flags")
    .select("id, file_id, kind, message, created_at, files(file_name)")
    .eq("disposition", "pending");

  type Row = {
    id: string;
    file_id: string;
    kind: "date" | "metric" | "ownership" | "complementary";
    message: string;
    created_at: string;
    files: { file_name: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    flagId: r.id,
    fileId: r.file_id,
    fileName: r.files?.file_name ?? "A file",
    kind: r.kind,
    message: r.message,
    createdAt: r.created_at,
  }));
}

/** Claims whose computed lifecycle is needs_investigation (no supporting evidence). */
async function getUnsupportedClaims(
  supabase: ServerClient,
  userId: string
): Promise<UnsupportedClaimSignal[]> {
  const claims = await getClaims(supabase, userId);
  return claims
    .filter((c) => c.lifecycle === "needs_investigation")
    .map((c) => ({ recordId: c.id, title: c.title }));
}

/** Open missing-info items (Phase 1 store). */
async function getOpenMissingInfo(
  supabase: ServerClient
): Promise<MissingInfoSignal[]> {
  const { data } = await supabase
    .from("missing_info_items")
    .select(
      "id, description, decision_record_id, claim_id, role_requirement_id, created_at"
    )
    .eq("status", "open");

  type Row = {
    id: string;
    description: string;
    decision_record_id: string | null;
    claim_id: string | null;
    role_requirement_id: string | null;
    created_at: string;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    itemId: r.id,
    description: r.description,
    decisionRecordId: r.decision_record_id,
    claimId: r.claim_id,
    roleRequirementId: r.role_requirement_id,
    createdAt: r.created_at,
  }));
}

/** Files uploaded but marked needs_review by a batch analysis pass. */
async function getUnreviewedFiles(
  supabase: ServerClient
): Promise<UnreviewedFileSignal[]> {
  const { data } = await supabase
    .from("files")
    .select("id, file_name")
    .eq("analysis_status", "needs_review");

  type Row = { id: string; file_name: string };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    fileId: r.id,
    fileName: r.file_name,
  }));
}

/** Interview sessions that are started but not complete. */
async function getUnfinishedInterviews(
  supabase: ServerClient
): Promise<UnfinishedInterviewSignal[]> {
  const { data } = await supabase
    .from("interview_sessions")
    .select("id, title, status, updated_at")
    .in("status", ["active", "paused"]);

  type Row = {
    id: string;
    title: string | null;
    status: "active" | "paused";
    updated_at: string;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    sessionId: r.id,
    title: r.title,
    status: r.status,
    updatedAt: r.updated_at,
  }));
}

/** Collect every signal the queue is built from, in parallel. RLS scopes each to the owner. */
export async function collectSignals(
  supabase: ServerClient,
  userId: string
): Promise<InvestigationSignals> {
  const [
    unverifiedRequirements,
    overclaimFlags,
    reconciliation,
    unsupportedClaims,
    missingInfo,
    unreviewedFiles,
    unfinishedInterviews,
  ] = await Promise.all([
    getUnverifiedRequirements(supabase),
    getOverclaimFlags(supabase),
    getReconciliation(supabase),
    getUnsupportedClaims(supabase, userId),
    getOpenMissingInfo(supabase),
    getUnreviewedFiles(supabase),
    getUnfinishedInterviews(supabase),
  ]);

  return {
    unverifiedRequirements,
    overclaimFlags,
    reconciliation,
    unsupportedClaims,
    missingInfo,
    unreviewedFiles,
    unfinishedInterviews,
  };
}
