import "server-only";
import { createClient } from "@/lib/supabase/server";
import { retriever } from "@/lib/rag/retrieve";
import { runStructured } from "@/lib/llm/run";
import { supabaseSink } from "@/lib/llm/supabase-sink";
import { LLM_CONFIG } from "@/lib/llm/config";
import {
  reviewerCheck,
  type ReviewCheckInput,
} from "@/lib/llm/prompts/reviewer-check";
import type { Citation } from "@/lib/rag/types";
import { createReview, reduce, CHECK_HARD_CAP } from "./machine";
import { noEvidenceFlag, resolveFlags } from "./grounding";
import {
  isEvidenceDimension,
  reviewFlagSchema,
  reviewModelOutputSchema,
  REVIEW_DIMENSIONS,
} from "./types";
import type {
  ModelFlag,
  ReviewDimension,
  ReviewFlag,
  ReviewState,
} from "./types";
import type { RecordReviewRow } from "./queries";

/**
 * The Reviewer Agent Check orchestrator (ADR-0016) — the `server-only` boundary that drives the
 * pure FSM (machine.ts). It performs the side effects the router must never contain (retrieval,
 * model calls, persistence) and feeds each result back as the next event. All dependencies are
 * injected so the whole flow is tested with fakes (tests/reviewer/) — no network, no database.
 * One model path: reuses runStructured + supabaseSink.
 *
 * HITL (R1 §3.4), structural: the review runs as one bounded pass (`startReview`) that returns the
 * proposed flags WITHOUT writing them. Flags are persisted and the record marked reviewed ONLY in
 * `acceptReview`, which drives the FSM through `awaiting_review --accept--> saving`. `rejectReview`
 * writes nothing. The tsx boundary test asserts no flag is written before accept, and none on reject.
 */

/** A domain error for the reviewer boundary (command/query separation: mutations throw). */
export class ReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewError";
  }
}

/** The subset of a decision record the reviewer reads (the CDM fields). */
export type ReviewableRecord = {
  id: string;
  title: string;
  situation: string | null;
  cue: string | null;
  decision: string | null;
  why: string | null;
  outcome: string | null;
};

// --- Persistence port (Humble Object): the exact Supabase surface the orchestrator uses. ---

export type NewReviewRow = {
  user_id: string;
  decision_record_id: string;
  status: "complete";
  check_budget: number;
  checks_done: number;
};
export type NewFlagRow = {
  review_id: string;
  user_id: string;
  dimension: ReviewDimension;
  severity: ReviewFlag["severity"];
  target_field: ReviewFlag["targetField"];
  message: string;
  citations: Citation[];
  disposition: ReviewFlag["disposition"];
  model_used: string;
  prompt_version: string;
};

export interface ReviewRepository {
  getRecord(recordId: string): Promise<ReviewableRecord | null>;
  latestCompleteReview(recordId: string): Promise<RecordReviewRow | null>;
  createReview(row: NewReviewRow): Promise<{ id: string }>;
  insertFlags(rows: NewFlagRow[]): Promise<void>;
}

/** The capabilities the orchestrator depends on — all injectable for tests. */
export type ReviewDeps = {
  retrieveEvidence: (query: string) => Promise<{
    found: boolean;
    context: string;
    sources: Citation[];
  }>;
  runReview: (input: ReviewCheckInput) => Promise<{
    flags: ModelFlag[];
    attempts: number;
    truncated: boolean;
  }>;
  repo: ReviewRepository;
};

export type ReviewRunResult = { recordId: string; state: ReviewState };

// A pass larger than this cannot happen under the budget + breaker; it is the R3/R1 force-stop.
const MAX_STEPS = CHECK_HARD_CAP * 5;

/** Serialise a record to the text the prompt reviews and the retrieval query is built from. */
export function serializeRecord(record: ReviewableRecord): string {
  const lines: Array<[string, string | null]> = [
    ["Title", record.title],
    ["Situation", record.situation],
    ["Cue", record.cue],
    ["Decision", record.decision],
    ["Why", record.why],
    ["Outcome", record.outcome],
  ];
  return lines
    .filter(([, v]) => v && v.trim() !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

/** The retrieval query for the evidence-grounded dimensions: the claim-bearing fields. */
function retrievalQuery(record: ReviewableRecord): string {
  return [record.title, record.decision, record.outcome]
    .filter((v) => v && v.trim() !== "")
    .join(" ");
}

type RunCtx = {
  recordId: string;
  userId: string;
  record: ReviewableRecord;
  recordText: string;
};

/** Run a single dimension's pass, returning the grounded flags for it (or the honest no-evidence flag). */
async function runDimension(
  deps: ReviewDeps,
  ctx: RunCtx,
  dimension: ReviewDimension
): Promise<ReviewFlag[]> {
  if (isEvidenceDimension(dimension)) {
    const evidence = await deps.retrieveEvidence(retrievalQuery(ctx.record));
    if (!evidence.found) {
      // No evidence short-circuit (mirrors the Gap Check): no model call, honest absence.
      // `support` states the absence; `accuracy` cannot judge overstatement with no evidence.
      return dimension === "support" ? [noEvidenceFlag()] : [];
    }
    const { flags } = await deps.runReview({
      dimension,
      recordText: ctx.recordText,
      evidenceContext: evidence.context,
    });
    return resolveFlags(dimension, flags, evidence.sources);
  }
  // Intrinsic dimension: judge the record text only, no retrieval, no evidence citation.
  const { flags } = await deps.runReview({
    dimension,
    recordText: ctx.recordText,
    evidenceContext: null,
  });
  return resolveFlags(dimension, flags, []);
}

/**
 * Advance the machine through its `reviewing` passes, running the dimension for the current index
 * and feeding the result back, until it reaches a state that waits for the user (awaiting_review)
 * or stops (paused). No persistence happens here — the proposed flags live only in the returned
 * state until the user accepts.
 */
async function advance(
  deps: ReviewDeps,
  ctx: RunCtx,
  initial: ReviewState
): Promise<ReviewState> {
  let state = initial;
  for (let steps = 0; steps < MAX_STEPS; steps++) {
    if (state.status !== "reviewing") return state;
    const dimension = REVIEW_DIMENSIONS[state.checksDone];
    // No dimension left to run (budget exceeds the dimension list): close the pass.
    if (!dimension) {
      return reduce(state, { type: "flags_ready", flags: [] });
    }
    try {
      const flags = await runDimension(deps, ctx, dimension);
      state = reduce(state, { type: "flags_ready", flags });
    } catch {
      state = reduce(state, { type: "llm_failed" });
    }
  }
  // Force-stop (unreachable under the budget + breaker): pause defensively.
  return {
    status: "paused",
    reason: "circuit_breaker",
    flags: state.status === "reviewing" ? state.flags : [],
    checkBudget: state.checkBudget,
    checksDone: state.checksDone,
    failureCount: state.failureCount,
  };
}

// --- Public operations the Server Actions call (one per user action). ---

/**
 * Run the full review pass over a saved record. Returns the proposed flags in the state; writes
 * nothing. The user then accepts / edits / rejects.
 */
export async function startReview(
  deps: ReviewDeps,
  params: { userId: string; recordId: string; checkBudget?: number }
): Promise<ReviewRunResult> {
  const record = await deps.repo.getRecord(params.recordId);
  if (!record) throw new ReviewError("decision record not found");
  const ctx: RunCtx = {
    recordId: params.recordId,
    userId: params.userId,
    record,
    recordText: serializeRecord(record),
  };
  const fresh = createReview({ checkBudget: params.checkBudget });
  const state = await advance(deps, ctx, reduce(fresh, { type: "plan_ready" }));
  return { recordId: params.recordId, state };
}

/**
 * Persist the user's accepted review: the HITL-gated side effect. Drives the FSM through
 * `awaiting_review --accept--> saving`, writes the (dispositioned) flags, and marks the record
 * reviewed. Idempotent: an already-completed review for the record is adopted, never re-written.
 */
export async function acceptReview(
  deps: ReviewDeps,
  params: {
    userId: string;
    recordId: string;
    flags: unknown[];
    checkBudget?: number;
  }
): Promise<ReviewRunResult> {
  // Idempotency (CLAUDE.md rule 7): never create a second completed review for a record.
  const existing = await deps.repo.latestCompleteReview(params.recordId);
  if (existing) {
    return {
      recordId: params.recordId,
      state: {
        status: "complete",
        flags: [],
        checkBudget: existing.check_budget,
        checksDone: existing.checks_done,
        failureCount: 0,
      },
    };
  }

  // The flags come back from the client as the user's dispositioned set; validate structurally.
  const flags: ReviewFlag[] = [];
  for (const raw of params.flags) {
    const parsed = reviewFlagSchema.safeParse(raw);
    if (parsed.success) flags.push(parsed.data as ReviewFlag);
  }

  const budget = createReview({ checkBudget: params.checkBudget }).checkBudget;
  const atGate: ReviewState = {
    status: "awaiting_review",
    flags,
    checkBudget: budget,
    checksDone: REVIEW_DIMENSIONS.length,
    failureCount: 0,
  };
  const saving = reduce(atGate, { type: "accept" });
  if (saving.status !== "saving") {
    throw new ReviewError("accept did not reach the saving state");
  }

  const { id: reviewId } = await deps.repo.createReview({
    user_id: params.userId,
    decision_record_id: params.recordId,
    status: "complete",
    check_budget: budget,
    checks_done: atGate.checksDone,
  });

  if (saving.flags.length > 0) {
    await deps.repo.insertFlags(
      saving.flags.map((f) => ({
        review_id: reviewId,
        user_id: params.userId,
        dimension: f.dimension,
        severity: f.severity,
        target_field: f.targetField,
        message: f.message,
        citations: f.citations,
        disposition: f.disposition,
        model_used: LLM_CONFIG.models[reviewerCheck.purpose][0],
        prompt_version: reviewerCheck.version,
      }))
    );
  }

  return {
    recordId: params.recordId,
    state: reduce(saving, { type: "saved" }),
  };
}

/** Reject the review: close it without marking the record reviewed and without writing flags. */
export async function rejectReview(
  _deps: ReviewDeps,
  params: { userId: string; recordId: string; checkBudget?: number }
): Promise<ReviewRunResult> {
  return {
    recordId: params.recordId,
    state: {
      status: "discarded",
      checkBudget: 4,
      checksDone: 0,
      failureCount: 0,
    },
  };
}

// --- Production dependencies (one model path; RLS-scoped Supabase under the caller). ---

function supabaseReviewRepository(
  supabase: Awaited<ReturnType<typeof createClient>>
): ReviewRepository {
  return {
    async getRecord(recordId) {
      const { data } = await supabase
        .from("decision_records")
        .select("id, title, situation, cue, decision, why, outcome")
        .eq("id", recordId)
        .maybeSingle();
      return (data as ReviewableRecord | null) ?? null;
    },
    async latestCompleteReview(recordId) {
      const { data } = await supabase
        .from("record_reviews")
        .select(
          "id, user_id, decision_record_id, status, check_budget, checks_done, created_at, updated_at"
        )
        .eq("decision_record_id", recordId)
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as RecordReviewRow | null) ?? null;
    },
    async createReview(row) {
      const { data, error } = await supabase
        .from("record_reviews")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new ReviewError(error.message);
      return { id: data.id as string };
    },
    async insertFlags(rows) {
      if (rows.length === 0) return;
      const { error } = await supabase.from("record_review_flags").insert(rows);
      if (error) throw new ReviewError(error.message);
    },
  };
}

/** Build the production dependencies for the signed-in user (RLS applies to every call). */
export async function defaultDeps(userId: string): Promise<ReviewDeps> {
  const supabase = await createClient();
  return {
    retrieveEvidence: async (q) => {
      const r = await retriever.retrieveEvidence(q);
      return {
        found: r.found,
        context: r.context,
        sources: r.sources.map((s) => ({
          source: s.source,
          id: s.id,
          title: s.title,
        })),
      };
    },
    runReview: async (input) => {
      const { data, attempts, truncated } = await runStructured({
        prompt: reviewerCheck,
        input,
        schema: reviewModelOutputSchema,
        sink: supabaseSink,
        userId,
      });
      return { flags: data.flags, attempts, truncated };
    },
    repo: supabaseReviewRepository(supabase),
  };
}
