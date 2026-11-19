import "server-only";
import { createClient } from "@/lib/supabase/server";
import { retriever } from "@/lib/rag/retrieve";
import { runStructured } from "@/lib/llm/run";
import { supabaseSink } from "@/lib/llm/supabase-sink";
import { LLM_CONFIG } from "@/lib/llm/config";
import { validateCitations, resolveVerdict } from "@/lib/gap/classify";
import {
  investigationReflect,
  type InvestigationReflectInput,
} from "@/lib/llm/prompts/investigation-reflect";
import type { GapVerdict } from "@/lib/gap/types";
import type { Citation, Retrieval } from "@/lib/rag/types";
import { createInvestigation, reduce, SEARCH_HARD_CAP } from "./machine";
import { reflectOutputSchema } from "./types";
import type {
  Finding,
  InvestigationState,
  ReflectOutput,
  Requirement,
} from "./types";

/**
 * The Evidence Investigation Agent orchestrator (ADR-0015) — the `server-only` boundary that
 * drives the pure FSM (machine.ts). It performs the side effects the router must never contain
 * (retrieval, the reflect model call, the assessment UPSERT) and feeds each result back as the
 * next event. All dependencies are injected so the whole flow is tested with fakes
 * (tests/investigation/) — no network, no database. One model path: reuses runStructured +
 * supabaseSink. The HITL invariant is structural in the FSM: `saving` is reachable only from
 * `awaiting_review` on `accept`, so the UPSERT in acceptFinding below can never run during the
 * review pass — the boundary test asserts a row is written only on accept, never on reject.
 */

/** A domain error for the investigation boundary (command/query separation: mutations throw). */
export class InvestigationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvestigationError";
  }
}

/** The capabilities the orchestrator depends on — all injectable for tests. */
export type InvestigationDeps = {
  retrieveEvidence: (query: string) => Promise<Retrieval>;
  reflect: (input: InvestigationReflectInput) => Promise<ReflectOutput>;
  saveAssessment: (row: InvestigationAssessmentRow) => Promise<void>;
};

/** A row upserted into `requirement_gap_assessments` with investigation provenance (EIA 5). */
export type InvestigationAssessmentRow = {
  user_id: string;
  role_requirement_id: string;
  target_role_id: string;
  verdict: GapVerdict;
  rationale: string;
  citations: Citation[]; // jsonb
  evidence_found: boolean;
  model_used: string;
  prompt_version: string;
  method: "investigated";
  confidence: Finding["confidence"];
  search_count: number;
};

export type InvestigationResult = {
  state: InvestigationState;
  finding: Finding | null;
};

/** Rationale stamped on a confirmed-gap finding when the search budget is spent. */
export const EXHAUSTED_RATIONALE =
  "No substantiating evidence was found after exhausting the search budget.";

// A loop larger than this cannot happen under the budget + breaker; it is the R3/R1 force-stop.
const MAX_STEPS = SEARCH_HARD_CAP * 4;

/** Map an accepted finding to an investigated assessment row (own-rows RLS applies on write). */
export function toInvestigationAssessmentRow(
  finding: Finding,
  ctx: { userId: string; targetRoleId: string }
): InvestigationAssessmentRow {
  return {
    user_id: ctx.userId,
    role_requirement_id: finding.requirementId,
    target_role_id: ctx.targetRoleId,
    verdict: finding.verdict,
    rationale: finding.rationale,
    citations: finding.citations,
    evidence_found: finding.citations.length > 0,
    model_used: LLM_CONFIG.models[investigationReflect.purpose][0],
    prompt_version: investigationReflect.version,
    method: "investigated",
    confidence: finding.confidence,
    search_count: finding.searchCount,
  };
}

/**
 * Drive the machine through its "working" states (planning / searching / reflecting / exhausted),
 * performing the side effect each one needs and feeding the result back, until it reaches a state
 * that waits for the user (awaiting_review / paused). Never saves — that is acceptFinding's job.
 */
async function advance(
  deps: InvestigationDeps,
  requirement: Requirement,
  searchBudget?: number
): Promise<InvestigationResult> {
  let state: InvestigationState = reduce(
    createInvestigation(requirement, { searchBudget }),
    { type: "search_planned", query: requirement.text }
  );
  let lastRetrieval: Retrieval | null = null;
  const priorQueries: string[] = [];
  let lastConfidence: Finding["confidence"] = "low";

  for (let steps = 0; steps < MAX_STEPS; steps++) {
    if (state.status === "searching") {
      lastRetrieval = await deps.retrieveEvidence(state.query);
      state = reduce(state, { type: "retrieved" });
      continue;
    }
    if (state.status === "reflecting") {
      const query = state.query;
      try {
        const retrieval = lastRetrieval ?? emptyRetrieval();
        const out = await deps.reflect({
          requirementText: requirement.text,
          evidenceContext: retrieval.context,
          previousQueries: [...priorQueries],
        });
        lastConfidence = out.confidence;
        // Closed-RAG grounding: keep only citations that point at really-retrieved sources,
        // then downgrade a met/partial verdict with no valid citation to gap (mirrors Gap Check).
        const validCitations = validateCitations(
          out.citations,
          retrieval.sources
        );
        const resolved = resolveVerdict(out.verdict, validCitations);
        if (out.sufficient && resolved !== "gap" && validCitations.length > 0) {
          const finding: Finding = {
            requirementId: requirement.id,
            verdict: resolved as Finding["verdict"],
            rationale: out.rationale,
            citations: validCitations,
            confidence: out.confidence,
            searchCount: state.searchCount,
          };
          state = reduce(state, { type: "substantiated", finding });
        } else {
          priorQueries.push(query);
          state = reduce(state, {
            type: "insufficient",
            nextQuery: out.nextQuery,
          });
        }
      } catch {
        state = reduce(state, { type: "llm_failed" });
      }
      continue;
    }
    if (state.status === "exhausted") {
      const finding: Finding = {
        requirementId: requirement.id,
        verdict: "gap",
        rationale: EXHAUSTED_RATIONALE,
        citations: [],
        confidence: lastConfidence,
        searchCount: state.searchCount,
      };
      state = reduce(state, { type: "finding_ready", finding });
      continue;
    }
    // A waiting state (awaiting_review / paused): return.
    return {
      state,
      finding: state.status === "awaiting_review" ? state.finding : null,
    };
  }
  // Force-stop (unreachable under the budget + breaker): treat as paused defensively.
  return { state, finding: null };
}

const emptyRetrieval = (): Retrieval => ({
  found: false,
  context: "",
  sources: [],
  hits: [],
});

// --- Public operations the Server Actions call (one per user action). ---

/** Investigate one requirement to a proposed finding (or paused). Saves nothing. */
export async function startInvestigation(
  deps: InvestigationDeps,
  params: { requirement: Requirement; searchBudget?: number }
): Promise<InvestigationResult> {
  return advance(deps, params.requirement, params.searchBudget);
}

/** HITL accept: persist the (possibly edited) finding as an investigated assessment. */
export async function acceptFinding(
  deps: InvestigationDeps,
  params: {
    userId: string;
    requirement: Requirement;
    targetRoleId: string;
    finding: Finding;
    searchBudget?: number;
  }
): Promise<InvestigationResult> {
  const review: InvestigationState = {
    status: "awaiting_review",
    requirement: params.requirement,
    finding: params.finding,
    searchBudget: Math.min(
      SEARCH_HARD_CAP,
      Math.max(1, params.searchBudget ?? 1)
    ),
    searchCount: params.finding.searchCount,
    failureCount: 0,
  };
  // The ONLY edge into `saving` — a save cannot happen on any other transition.
  const saving = reduce(review, { type: "accept" });
  if (saving.status !== "saving") {
    throw new InvestigationError("accept did not reach the saving state");
  }
  await deps.saveAssessment(
    toInvestigationAssessmentRow(params.finding, {
      userId: params.userId,
      targetRoleId: params.targetRoleId,
    })
  );
  return { state: reduce(saving, { type: "saved" }), finding: params.finding };
}

/** HITL reject: leave the assessment unchanged. Takes no deps — it cannot save. */
export async function rejectFinding(params: {
  requirement: Requirement;
  finding: Finding;
  searchBudget?: number;
}): Promise<InvestigationResult> {
  const review: InvestigationState = {
    status: "awaiting_review",
    requirement: params.requirement,
    finding: params.finding,
    searchBudget: Math.min(
      SEARCH_HARD_CAP,
      Math.max(1, params.searchBudget ?? 1)
    ),
    searchCount: params.finding.searchCount,
    failureCount: 0,
  };
  return { state: reduce(review, { type: "reject" }), finding: null };
}

// --- Production dependencies (one model path; RLS-scoped Supabase under the caller). ---

/** Build the production dependencies for the signed-in user (RLS applies to every call). */
export async function defaultDeps(userId: string): Promise<InvestigationDeps> {
  const supabase = await createClient();
  return {
    retrieveEvidence: (q) => retriever.retrieveEvidence(q),
    reflect: async (input) => {
      const { data } = await runStructured({
        prompt: investigationReflect,
        input,
        schema: reflectOutputSchema,
        sink: supabaseSink,
        userId,
      });
      return data;
    },
    saveAssessment: async (row) => {
      const { error } = await supabase
        .from("requirement_gap_assessments")
        .upsert([row], { onConflict: "role_requirement_id" });
      if (error) {
        throw new InvestigationError(
          `saving investigated assessment failed: ${error.message}`
        );
      }
    },
  };
}
