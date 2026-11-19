import "server-only";
import { createClient } from "@/lib/supabase/server";
import { retriever } from "@/lib/rag/retrieve";
import { runLLM, runStructured } from "@/lib/llm/run";
import { supabaseSink } from "@/lib/llm/supabase-sink";
import {
  interviewQuestion,
  type InterviewQuestionInput,
} from "@/lib/llm/prompts/interview-question";
import {
  interviewParaphrase,
  type InterviewParaphraseInput,
} from "@/lib/llm/prompts/interview-paraphrase";
import { saveDecisionRecord } from "@/lib/decision-records/save";
import { indexDecisionRecordEvidence } from "@/lib/decision-records/index-evidence";
import { createSupabaseDecisionRecordRepository } from "@/lib/decision-records/repository";
import { createInterview, reduce, QUESTION_HARD_CAP } from "./machine";
import { cdmDraftSchema } from "./types";
import type { CdmDraft, GroundingCitation, InterviewState } from "./types";
import type { InterviewSessionRow, InterviewTurnRow } from "./queries";

/**
 * The Reasoning Interview orchestrator (ADR-0013) — the `server-only` boundary that drives the
 * pure FSM (machine.ts). It performs the side effects the router must never contain (retrieval,
 * model calls, persistence, the decision-record save) and feeds each result back as the next
 * event. All dependencies are injected so the whole flow is tested with fakes (tests/interview/)
 * — no network, no database. One model path: reuses runLLM/runStructured + supabaseSink.
 *
 * The HITL invariant is enforced structurally by the FSM: `saving` is reachable only from
 * `awaiting_confirmation` on `accept`, so the save in the `saving` branch below can never run in
 * the same step as a paraphrase. The tsx boundary test asserts a record is written only after
 * accept, never during paraphrase.
 */

/** A domain error for the interview boundary (command/query separation: mutations throw). */
export class InterviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterviewError";
  }
}

// --- Persistence port (Humble Object): the exact Supabase surface the orchestrator uses. ---

export type NewSessionRow = {
  user_id: string;
  title: string;
  target_role_id: string | null;
  status: "active" | "paused" | "complete";
  question_budget: number;
  asked_count: number;
};
export type SessionPatch = Partial<
  Pick<InterviewSessionRow, "status" | "asked_count" | "title">
>;
export type NewTurnRow = {
  session_id: string;
  user_id: string;
  question_text: string;
  grounding_citation: GroundingCitation | null;
  status: InterviewTurnRow["status"];
};
export type TurnPatch = Partial<
  Pick<
    InterviewTurnRow,
    "answer_text" | "paraphrase" | "status" | "decision_record_id"
  >
>;

export interface InterviewRepository {
  createSession(row: NewSessionRow): Promise<{ id: string }>;
  updateSession(id: string, patch: SessionPatch): Promise<void>;
  getSession(id: string): Promise<InterviewSessionRow | null>;
  getTurns(sessionId: string): Promise<InterviewTurnRow[]>;
  getTurn(id: string): Promise<InterviewTurnRow | null>;
  createTurn(row: NewTurnRow): Promise<{ id: string }>;
  updateTurn(id: string, patch: TurnPatch): Promise<void>;
}

/** The capabilities the orchestrator depends on — all injectable for tests. */
export type InterviewDeps = {
  retrieveEvidence: (question: string) => Promise<{
    found: boolean;
    context: string;
    sources: GroundingCitation[];
  }>;
  generateQuestion: (input: InterviewQuestionInput) => Promise<string>;
  paraphrase: (input: InterviewParaphraseInput) => Promise<CdmDraft>;
  saveRecord: (args: {
    userId: string;
    draft: CdmDraft;
  }) => Promise<{ recordId: string }>;
  repo: InterviewRepository;
};

export type InterviewRunResult = {
  sessionId: string;
  state: InterviewState;
};

// Working context carried through one request as the machine advances.
type RunCtx = {
  sessionId: string;
  userId: string;
  topic: string;
  previousQuestions: string[];
  currentTurnId: string | null;
};

// A loop larger than this cannot happen under the budget + breaker; it is the R3/R1 force-stop.
const MAX_STEPS = QUESTION_HARD_CAP * 5;

const sessionStatusFor = (
  state: InterviewState
): "active" | "paused" | "complete" =>
  state.status === "complete"
    ? "complete"
    : state.status === "paused"
      ? "paused"
      : "active";

/** Rebuild the FSM state from the persisted session + its turns (ADR-0014 rehydration). */
function rehydrate(
  session: InterviewSessionRow,
  turns: InterviewTurnRow[]
): { state: InterviewState; currentTurnId: string | null } {
  const base = {
    questionBudget: session.question_budget,
    askedCount: session.asked_count,
    failureCount: 0,
  };
  if (session.status === "complete") {
    return { state: { status: "complete", ...base }, currentTurnId: null };
  }
  if (session.status === "paused") {
    return {
      state: { status: "paused", reason: "user", ...base },
      currentTurnId: null,
    };
  }
  const latest = turns.length > 0 ? turns[turns.length - 1] : null;
  if (!latest) {
    return { state: { status: "asking", ...base }, currentTurnId: null };
  }
  const question = {
    text: latest.question_text,
    citation: latest.grounding_citation,
  };
  if (latest.status === "asked") {
    return {
      state: { status: "awaiting_answer", question, ...base },
      currentTurnId: latest.id,
    };
  }
  if (latest.status === "answered" && latest.paraphrase) {
    return {
      state: {
        status: "awaiting_confirmation",
        question,
        answer: latest.answer_text ?? "",
        draft: latest.paraphrase,
        ...base,
      },
      currentTurnId: latest.id,
    };
  }
  // saved / skipped (or answered-without-draft): ready for the next question.
  return { state: { status: "asking", ...base }, currentTurnId: null };
}

async function load(
  deps: InterviewDeps,
  sessionId: string,
  userId: string
): Promise<{ state: InterviewState; ctx: RunCtx; turns: InterviewTurnRow[] }> {
  const session = await deps.repo.getSession(sessionId);
  if (!session) throw new InterviewError("interview session not found");
  const turns = await deps.repo.getTurns(sessionId);
  const { state, currentTurnId } = rehydrate(session, turns);
  return {
    state,
    ctx: {
      sessionId,
      userId,
      topic: session.title,
      previousQuestions: turns.map((t) => t.question_text),
      currentTurnId,
    },
    turns,
  };
}

/**
 * If an answer was captured but never turned into a draft — the circuit breaker tripped during
 * paraphrasing, so the session was paused with the turn left `answered` and no paraphrase — rebuild
 * the `paraphrasing` state for that turn so resume re-attempts it instead of stranding the answer.
 * Returns null when there is nothing to recover (the normal resume path then applies).
 */
function pendingParaphrase(
  state: InterviewState,
  turns: InterviewTurnRow[],
  ctx: RunCtx
): InterviewState | null {
  if (state.status !== "paused") return null;
  const latest = turns.length > 0 ? turns[turns.length - 1] : null;
  if (
    !latest ||
    latest.status !== "answered" ||
    !latest.answer_text ||
    latest.paraphrase
  ) {
    return null;
  }
  ctx.currentTurnId = latest.id;
  return {
    status: "paraphrasing",
    question: {
      text: latest.question_text,
      citation: latest.grounding_citation,
    },
    answer: latest.answer_text,
    questionBudget: state.questionBudget,
    askedCount: state.askedCount,
    failureCount: 0,
  };
}

async function persistSession(
  deps: InterviewDeps,
  ctx: RunCtx,
  state: InterviewState
): Promise<void> {
  await deps.repo.updateSession(ctx.sessionId, {
    status: sessionStatusFor(state),
    asked_count: state.askedCount,
  });
}

/**
 * Advance the machine through its "working" states (planning / asking / paraphrasing / saving),
 * performing the side effect each one needs and feeding the result back, until it reaches a
 * state that waits for the user (awaiting_answer / awaiting_confirmation / paused / complete).
 */
async function advance(
  deps: InterviewDeps,
  ctx: RunCtx,
  initial: InterviewState
): Promise<InterviewState> {
  let state = initial;
  for (let steps = 0; steps < MAX_STEPS; steps++) {
    if (state.status === "planning") {
      state = reduce(state, { type: "plan_ready" });
      continue;
    }
    if (state.status === "asking") {
      try {
        const evidence = await deps.retrieveEvidence(ctx.topic);
        const citation = evidence.found ? (evidence.sources[0] ?? null) : null;
        const text = await deps.generateQuestion({
          topic: ctx.topic,
          evidenceContext: evidence.found ? evidence.context : null,
          previousQuestions: ctx.previousQuestions,
        });
        const next = reduce(state, {
          type: "question_ready",
          question: { text, citation },
        });
        if (next.status === "awaiting_answer") {
          const { id } = await deps.repo.createTurn({
            session_id: ctx.sessionId,
            user_id: ctx.userId,
            question_text: text,
            grounding_citation: citation,
            status: "asked",
          });
          ctx.currentTurnId = id;
          ctx.previousQuestions.push(text);
        }
        state = next;
      } catch {
        state = reduce(state, { type: "llm_failed" });
      }
      continue;
    }
    if (state.status === "paraphrasing") {
      try {
        const draft = await deps.paraphrase({
          question: state.question.text,
          answer: state.answer,
          evidenceContext: null,
        });
        const next = reduce(state, { type: "paraphrase_ready", draft });
        if (next.status === "awaiting_confirmation" && ctx.currentTurnId) {
          await deps.repo.updateTurn(ctx.currentTurnId, {
            answer_text: state.answer,
            paraphrase: draft,
            status: "answered",
          });
        }
        state = next;
      } catch {
        state = reduce(state, { type: "llm_failed" });
      }
      continue;
    }
    if (state.status === "saving") {
      // Idempotency (CLAUDE.md rule 7): never create a second decision record for a turn that
      // already has one. Covers a retry after a partial failure and a repeat/late accept whose
      // first save already completed — we adopt the existing record instead of saving again.
      const existing = ctx.currentTurnId
        ? await deps.repo.getTurn(ctx.currentTurnId)
        : null;
      if (existing?.decision_record_id) {
        state = reduce(state, { type: "saved" });
        continue;
      }
      const { recordId } = await deps.saveRecord({
        userId: ctx.userId,
        draft: state.draft,
      });
      if (ctx.currentTurnId) {
        await deps.repo.updateTurn(ctx.currentTurnId, {
          decision_record_id: recordId,
          status: "saved",
        });
      }
      state = reduce(state, { type: "saved" });
      continue;
    }
    // A waiting state: persist and return.
    await persistSession(deps, ctx, state);
    return state;
  }
  // Force-stop (should be unreachable under the budget + breaker): pause defensively.
  const stopped: InterviewState = {
    status: "paused",
    reason: "circuit_breaker",
    questionBudget: state.questionBudget,
    askedCount: state.askedCount,
    failureCount: state.failureCount,
  };
  await persistSession(deps, ctx, stopped);
  return stopped;
}

// --- Public operations the Server Actions call (one per user action). ---

export async function startInterview(
  deps: InterviewDeps,
  params: {
    userId: string;
    title: string;
    targetRoleId?: string | null;
    questionBudget?: number;
  }
): Promise<InterviewRunResult> {
  const fresh = createInterview({ questionBudget: params.questionBudget });
  const { id: sessionId } = await deps.repo.createSession({
    user_id: params.userId,
    title: params.title,
    target_role_id: params.targetRoleId ?? null,
    status: "active",
    question_budget: fresh.questionBudget,
    asked_count: 0,
  });
  const ctx: RunCtx = {
    sessionId,
    userId: params.userId,
    topic: params.title,
    previousQuestions: [],
    currentTurnId: null,
  };
  const state = await advance(deps, ctx, fresh);
  return { sessionId, state };
}

export async function submitAnswer(
  deps: InterviewDeps,
  params: { sessionId: string; userId: string; answer: string }
): Promise<InterviewRunResult> {
  const { state, ctx } = await load(deps, params.sessionId, params.userId);
  const next = reduce(state, {
    type: "answer_submitted",
    answer: params.answer,
  });
  if (next.status === "paraphrasing" && ctx.currentTurnId) {
    // Persist the answer immediately so it is not lost if paraphrasing then fails.
    await deps.repo.updateTurn(ctx.currentTurnId, {
      answer_text: params.answer,
      status: "answered",
    });
  } else if (next.status !== "paraphrasing" && ctx.currentTurnId) {
    // Empty answer → skip: mark the turn skipped before moving on.
    await deps.repo.updateTurn(ctx.currentTurnId, { status: "skipped" });
  }
  const final = await advance(deps, ctx, next);
  return { sessionId: params.sessionId, state: final };
}

export async function skipQuestion(
  deps: InterviewDeps,
  params: { sessionId: string; userId: string }
): Promise<InterviewRunResult> {
  const { state, ctx } = await load(deps, params.sessionId, params.userId);
  if (state.status === "awaiting_answer" && ctx.currentTurnId) {
    await deps.repo.updateTurn(ctx.currentTurnId, { status: "skipped" });
  }
  const final = await advance(
    deps,
    ctx,
    reduce(state, { type: "answer_skipped" })
  );
  return { sessionId: params.sessionId, state: final };
}

export async function acceptDraft(
  deps: InterviewDeps,
  params: { sessionId: string; userId: string }
): Promise<InterviewRunResult> {
  const { state, ctx } = await load(deps, params.sessionId, params.userId);
  const final = await advance(deps, ctx, reduce(state, { type: "accept" }));
  return { sessionId: params.sessionId, state: final };
}

export async function editDraft(
  deps: InterviewDeps,
  params: { sessionId: string; userId: string }
): Promise<InterviewRunResult> {
  const { state, ctx } = await load(deps, params.sessionId, params.userId);
  const next = reduce(state, { type: "edit" });
  if (next.status === "awaiting_answer" && ctx.currentTurnId) {
    // Re-open the turn for a fresh answer (same question, no re-count).
    await deps.repo.updateTurn(ctx.currentTurnId, { status: "asked" });
  }
  await persistSession(deps, ctx, next);
  return { sessionId: params.sessionId, state: next };
}

export async function rejectDraft(
  deps: InterviewDeps,
  params: { sessionId: string; userId: string }
): Promise<InterviewRunResult> {
  const { state, ctx } = await load(deps, params.sessionId, params.userId);
  const final = await advance(deps, ctx, reduce(state, { type: "reject" }));
  return { sessionId: params.sessionId, state: final };
}

export async function pauseInterview(
  deps: InterviewDeps,
  params: { sessionId: string; userId: string }
): Promise<InterviewRunResult> {
  const { state, ctx } = await load(deps, params.sessionId, params.userId);
  const next = reduce(state, { type: "pause" });
  await persistSession(deps, ctx, next);
  return { sessionId: params.sessionId, state: next };
}

export async function resumeInterview(
  deps: InterviewDeps,
  params: { sessionId: string; userId: string }
): Promise<InterviewRunResult> {
  const { state, ctx, turns } = await load(
    deps,
    params.sessionId,
    params.userId
  );
  // Recover an answer captured but not yet paraphrased (breaker tripped mid-paraphrase), else
  // resume normally — ask the next question (or complete).
  const start =
    pendingParaphrase(state, turns, ctx) ?? reduce(state, { type: "resume" });
  const final = await advance(deps, ctx, start);
  return { sessionId: params.sessionId, state: final };
}

// --- Production dependencies (one model path; RLS-scoped Supabase under the caller). ---

function supabaseInterviewRepository(
  supabase: Awaited<ReturnType<typeof createClient>>
): InterviewRepository {
  return {
    async createSession(row) {
      const { data, error } = await supabase
        .from("interview_sessions")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new InterviewError(error.message);
      return { id: data.id as string };
    },
    async updateSession(id, patch) {
      const { error } = await supabase
        .from("interview_sessions")
        .update(patch)
        .eq("id", id);
      if (error) throw new InterviewError(error.message);
    },
    async getSession(id) {
      const { data } = await supabase
        .from("interview_sessions")
        .select(
          "id, user_id, title, target_role_id, status, question_budget, asked_count, created_at, updated_at"
        )
        .eq("id", id)
        .maybeSingle();
      return (data as InterviewSessionRow | null) ?? null;
    },
    async getTurns(sessionId) {
      const { data } = await supabase
        .from("interview_turns")
        .select(
          "id, session_id, user_id, question_text, grounding_citation, answer_text, paraphrase, status, decision_record_id, created_at"
        )
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      return (data ?? []) as InterviewTurnRow[];
    },
    async getTurn(id) {
      const { data } = await supabase
        .from("interview_turns")
        .select(
          "id, session_id, user_id, question_text, grounding_citation, answer_text, paraphrase, status, decision_record_id, created_at"
        )
        .eq("id", id)
        .maybeSingle();
      return (data as InterviewTurnRow | null) ?? null;
    },
    async createTurn(row) {
      const { data, error } = await supabase
        .from("interview_turns")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new InterviewError(error.message);
      return { id: data.id as string };
    },
    async updateTurn(id, patch) {
      const { error } = await supabase
        .from("interview_turns")
        .update(patch)
        .eq("id", id);
      if (error) throw new InterviewError(error.message);
    },
  };
}

/** Build the production dependencies for the signed-in user (RLS applies to every call). */
export async function defaultDeps(userId: string): Promise<InterviewDeps> {
  const supabase = await createClient();
  const decisionRepo = createSupabaseDecisionRecordRepository(supabase);
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
    generateQuestion: async (input) => {
      const { text } = await runLLM({
        prompt: interviewQuestion,
        input,
        sink: supabaseSink,
        userId,
      });
      return text.trim();
    },
    paraphrase: async (input) => {
      const { data } = await runStructured({
        prompt: interviewParaphrase,
        input,
        schema: cdmDraftSchema,
        sink: supabaseSink,
        userId,
      });
      return data;
    },
    saveRecord: async ({ userId: uid, draft }) => {
      const result = await saveDecisionRecord(decisionRepo, {
        userId: uid,
        input: {
          title: draft.title,
          situation: draft.situation,
          cue: draft.cue ?? undefined,
          decision: draft.decision,
          why: draft.why ?? undefined,
          outcome: draft.outcome,
          source: "self_reported",
        },
      });
      if (!result.ok) throw new InterviewError(result.error);
      // Index the accepted record as searchable evidence (Gap Check). Best-effort: the
      // record is saved, so an indexing failure must not fail the interview's save step.
      try {
        await indexDecisionRecordEvidence({
          recordId: result.recordId,
          fields: {
            title: draft.title,
            situation: draft.situation,
            cue: draft.cue ?? undefined,
            decision: draft.decision,
            why: draft.why ?? undefined,
            outcome: draft.outcome,
          },
        });
      } catch (err) {
        console.error("evidence indexing failed for interview record", err);
      }
      return { recordId: result.recordId };
    },
    repo: supabaseInterviewRepository(supabase),
  };
}
