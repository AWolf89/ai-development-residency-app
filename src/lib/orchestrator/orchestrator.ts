import "server-only";
import { createClient } from "@/lib/supabase/server";
import { reconcileFile } from "@/lib/file-analysis/reconciliation/orchestrator";
import { proposeFromFile } from "@/lib/file-analysis/proposal/orchestrator";
import {
  startInterview,
  startTimelineInterview,
  defaultDeps as interviewDeps,
} from "@/lib/interview/orchestrator";
import {
  startReview,
  defaultDeps as reviewerDeps,
} from "@/lib/reviewer/orchestrator";
import { collectSignals } from "@/lib/investigations/signals";
import { buildQueue } from "@/lib/investigations/build";
import type { InvestigationItem } from "@/lib/investigations/types";
import { createRun, reduce } from "./machine";
import type { OrchestrationRunRow } from "./queries";
import type { OrchestrationState, StepKey, StepLedger } from "./types";

/**
 * The thin orchestration boundary (ADR-0026) — the `server-only` Humble Object that drives the pure
 * router (machine.ts). It SEQUENCES the existing per-agent entry points (reconcile → propose →
 * interview → review) and tracks workflow position in one durable row; it re-implements NO agent
 * reasoning (AC1). Every evidence side effect still passes its own agent's accept-only HITL gate
 * (AC2) — the orchestrator only ever calls the agents' NON-side-effecting PROPOSE entry points
 * (injected as `runners`), then records that the user's own save happened via `completeStep`. All
 * dependencies are injected so the whole flow is tested with fakes (no network, no DB). RLS scopes
 * every query to the signed-in owner, and each op re-checks ownership defensively (AC5).
 */

/** A domain error for the orchestration boundary (command/query separation: mutations throw). */
export class OrchestrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrchestrationError";
  }
}

// --- Persistence port (Humble Object): the exact Supabase surface the orchestrator uses. ---

export type NewRunRow = {
  user_id: string;
  file_id: string;
  project_id: string | null;
  interview_session_id: string | null;
  status: OrchestrationState["status"];
  steps: StepLedger;
  cursor: StepKey | null;
  failure_step: StepKey | null;
};
export type RunPatch = Partial<
  Pick<
    OrchestrationRunRow,
    | "status"
    | "steps"
    | "cursor"
    | "failure_step"
    | "project_id"
    | "interview_session_id"
  >
>;

export interface OrchestrationRepository {
  createRun(row: NewRunRow): Promise<{ id: string }>;
  getRun(id: string): Promise<OrchestrationRunRow | null>;
  updateRun(id: string, patch: RunPatch): Promise<void>;
}

/**
 * One step's PROPOSE adapter: calls the existing agent's non-side-effecting entry point for the run,
 * returns an opaque proposal `payload` for the UI to render, and optionally a `patch` that records
 * linkage the later steps need (e.g. the interview session id). It MUST NOT persist evidence — that
 * is the agent's own HITL save, invoked separately. All adapters are injected (Dependency Inversion)
 * so the boundary test proves no save ever runs during `advanceRun`.
 */
export type StepRunner = (run: OrchestrationRunRow) => Promise<{
  payload: unknown;
  patch?: RunPatch;
}>;

/** The capabilities the orchestrator depends on — all injectable for tests. */
export type OrchestrationDeps = {
  runners: Record<StepKey, StepRunner>;
  /** The derive-on-read Investigation Queue, surfaced when the flow completes. No queue table. */
  loadQueue: () => Promise<InvestigationItem[]>;
  /**
   * Read back the project id the propose step's accept-only save created for a file (null if none).
   * The orchestrator never saves; it only OBSERVES the agent's own HITL save via `completeStep`, so
   * it learns the created project id by this read — never by a new reasoning or persistence path.
   */
  resolveProjectId: (fileId: string) => Promise<string | null>;
  repo: OrchestrationRepository;
};

/** One rendered proposal handed back to the UI (opaque payload — the orchestrator never reads it). */
export type StepProposal = { step: StepKey; payload: unknown };

export type OrchestrationRunResult = {
  runId: string;
  state: OrchestrationState;
  /** The proposal to review for the step just advanced, when one was produced. */
  proposal: StepProposal | null;
  /** The Investigation Queue, present only once the run is `complete`. */
  queue: InvestigationItem[] | null;
};

/** Rebuild the pure FSM state from the persisted row (ADR-0014 rehydration pattern). */
export function rehydrate(row: OrchestrationRunRow): OrchestrationState {
  return {
    status: row.status,
    steps: row.steps,
    cursor: row.cursor,
    failureStep: row.failure_step,
  };
}

/** The persistable slice of a state (position only). */
function toPatch(state: OrchestrationState): RunPatch {
  return {
    status: state.status,
    steps: state.steps,
    cursor: state.cursor,
    failure_step: state.failureStep,
  };
}

/** Load a run and defensively confirm ownership (RLS is the real guard; this fails closed). */
async function loadOwned(
  deps: OrchestrationDeps,
  runId: string,
  userId: string
): Promise<OrchestrationRunRow> {
  const row = await deps.repo.getRun(runId);
  if (!row || row.user_id !== userId) {
    throw new OrchestrationError("orchestration run not found");
  }
  return row;
}

/** Surface the queue only on completion, so a mid-flow result never pays for the read. */
async function queueIfComplete(
  deps: OrchestrationDeps,
  state: OrchestrationState
): Promise<InvestigationItem[] | null> {
  return state.status === "complete" ? deps.loadQueue() : null;
}

// --- Public operations the Server Actions call (one per user action). ---

/** Start a fresh flow anchored to an uploaded file. No agent runs yet; call `advanceRun` next. */
export async function startRun(
  deps: OrchestrationDeps,
  params: { userId: string; fileId: string }
): Promise<OrchestrationRunResult> {
  const fresh = createRun();
  const { id } = await deps.repo.createRun({
    user_id: params.userId,
    file_id: params.fileId,
    project_id: null,
    interview_session_id: null,
    status: fresh.status,
    steps: fresh.steps,
    cursor: fresh.cursor,
    failure_step: fresh.failureStep,
  });
  return { runId: id, state: fresh, proposal: null, queue: null };
}

/**
 * Advance the run: run the cursor step's PROPOSE entry point and move to `awaiting_review`, handing
 * the proposal to the user. If the entry point throws, the step is marked `failed` and the run
 * becomes resumable (AC4) — no prior save is touched. A run that is not `running` is returned as-is.
 */
export async function advanceRun(
  deps: OrchestrationDeps,
  params: { runId: string; userId: string }
): Promise<OrchestrationRunResult> {
  const row = await loadOwned(deps, params.runId, params.userId);
  const state = rehydrate(row);
  if (state.status !== "running" || state.cursor === null) {
    return {
      runId: params.runId,
      state,
      proposal: null,
      queue: await queueIfComplete(deps, state),
    };
  }
  const step = state.cursor;
  try {
    const { payload, patch } = await deps.runners[step](row);
    const next = reduce(state, { type: "step_proposed" });
    await deps.repo.updateRun(params.runId, { ...patch, ...toPatch(next) });
    return {
      runId: params.runId,
      state: next,
      proposal: { step, payload },
      queue: null,
    };
  } catch {
    const next = reduce(state, { type: "step_failed" });
    await deps.repo.updateRun(params.runId, toPatch(next));
    return { runId: params.runId, state: next, proposal: null, queue: null };
  }
}

/**
 * When the PROPOSE step's save is the one being accepted, read back the project that save created
 * and record its id on the run, so the later interview step anchors to it (timeline-anchored
 * Decision-Point Interview, ADR-0021). This is a position-only patch over an existing column — no
 * new reasoning, no new save path. It fires once (only while `project_id` is still unset) and only
 * for the propose step; every other accept returns an empty patch.
 */
async function projectLinkOnAccept(
  deps: OrchestrationDeps,
  row: OrchestrationRunRow,
  state: OrchestrationState
): Promise<RunPatch> {
  const acceptingPropose =
    state.status === "awaiting_review" && state.cursor === "propose";
  if (!acceptingPropose || row.project_id !== null) return {};
  const projectId = await deps.resolveProjectId(row.file_id);
  return projectId ? { project_id: projectId } : {};
}

/**
 * Record that the cursor step's own agent HITL save succeeded (the gate fired outside the
 * orchestrator — AC2) and advance to the next step. Ignored unless the step is `awaiting_review`.
 * On a propose accept it also captures the created project id (`projectLinkOnAccept`).
 */
export async function completeStep(
  deps: OrchestrationDeps,
  params: { runId: string; userId: string }
): Promise<OrchestrationRunResult> {
  const row = await loadOwned(deps, params.runId, params.userId);
  const state = rehydrate(row);
  const linkPatch = await projectLinkOnAccept(deps, row, state);
  const next = reduce(state, { type: "step_accepted" });
  await deps.repo.updateRun(params.runId, { ...linkPatch, ...toPatch(next) });
  return {
    runId: params.runId,
    state: next,
    proposal: null,
    queue: await queueIfComplete(deps, next),
  };
}

/** The user skipped the cursor step; advance without saving it. */
export async function skipStep(
  deps: OrchestrationDeps,
  params: { runId: string; userId: string }
): Promise<OrchestrationRunResult> {
  const row = await loadOwned(deps, params.runId, params.userId);
  const next = reduce(rehydrate(row), { type: "step_skipped" });
  await deps.repo.updateRun(params.runId, toPatch(next));
  return {
    runId: params.runId,
    state: next,
    proposal: null,
    queue: await queueIfComplete(deps, next),
  };
}

/** Resume a failed run: re-open the failed step as pending. The caller then calls `advanceRun`. */
export async function resumeRun(
  deps: OrchestrationDeps,
  params: { runId: string; userId: string }
): Promise<OrchestrationRunResult> {
  const row = await loadOwned(deps, params.runId, params.userId);
  const next = reduce(rehydrate(row), { type: "resume" });
  await deps.repo.updateRun(params.runId, toPatch(next));
  return { runId: params.runId, state: next, proposal: null, queue: null };
}

/** Read the current position (and, when complete, the Investigation Queue). No side effects. */
export async function getRun(
  deps: OrchestrationDeps,
  params: { runId: string; userId: string }
): Promise<OrchestrationRunResult> {
  const row = await loadOwned(deps, params.runId, params.userId);
  const state = rehydrate(row);
  return {
    runId: params.runId,
    state,
    proposal: null,
    queue: await queueIfComplete(deps, state),
  };
}

// --- Production dependencies (compose the real entry points; RLS-scoped under the caller). ---

/**
 * Build the production step runners. Each is a thin adapter over an EXISTING agent entry point — no
 * prompt, no reasoning (AC1). Any glue (which record to review, the interview title) is DB wiring,
 * not model logic, and lives here behind the injected interface so the pure boundary stays clean.
 */
export async function defaultDeps(userId: string): Promise<OrchestrationDeps> {
  const supabase = await createClient();

  const repo: OrchestrationRepository = {
    async createRun(row) {
      const { data, error } = await supabase
        .from("orchestration_runs")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new OrchestrationError(error.message);
      return { id: data.id as string };
    },
    async getRun(id) {
      const { data } = await supabase
        .from("orchestration_runs")
        .select(
          "id, user_id, file_id, project_id, interview_session_id, status, steps, cursor, failure_step, created_at, updated_at"
        )
        .eq("id", id)
        .maybeSingle();
      return (data as OrchestrationRunRow | null) ?? null;
    },
    async updateRun(id, patch) {
      const { error } = await supabase
        .from("orchestration_runs")
        .update(patch)
        .eq("id", id);
      if (error) throw new OrchestrationError(error.message);
    },
  };

  /** The decision records the propose step linked to this file, newest first (for the review step). */
  async function linkedRecordIds(fileId: string): Promise<string[]> {
    const { data } = await supabase
      .from("evidence_links")
      .select("decision_record_id, created_at")
      .eq("file_id", fileId)
      .not("decision_record_id", "is", null)
      .order("created_at", { ascending: false });
    return ((data ?? []) as { decision_record_id: string | null }[])
      .map((r) => r.decision_record_id)
      .filter((id): id is string => id !== null);
  }

  /**
   * The project the propose step's approved save created for this file, newest first (null if the
   * user approved records without a project, or skipped propose). Found by the project id on the
   * newest decision record linked to the file — the same evidence_links wiring `linkedRecordIds`
   * reads — so the orchestrator observes the created project without a new save path.
   */
  async function projectForFile(fileId: string): Promise<string | null> {
    const recordIds = await linkedRecordIds(fileId);
    if (recordIds.length === 0) return null;
    const { data } = await supabase
      .from("decision_records")
      .select("project_id, created_at")
      .in("id", recordIds)
      .not("project_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = ((data ?? []) as { project_id: string | null }[])[0];
    return row?.project_id ?? null;
  }

  /** The file's name, used as the interview title. */
  async function fileName(fileId: string): Promise<string> {
    const { data } = await supabase
      .from("files")
      .select("file_name")
      .eq("id", fileId)
      .maybeSingle();
    return (
      (data as { file_name: string } | null)?.file_name ?? "Uploaded file"
    ).toString();
  }

  const runners: Record<StepKey, StepRunner> = {
    // Compare the new file against existing evidence (no write — flags saved only on the user's
    // explicit reconciliation decision).
    reconcile: async (run) => ({ payload: await reconcileFile(run.file_id) }),

    // Propose a project + evidence records from the file (no write — persisted only on approve).
    // The created project id is captured later, when the user accepts this step's save
    // (`projectLinkOnAccept`), so the interview step can anchor to it.
    propose: async (run) => {
      const proposal = await proposeFromFile(run.file_id);
      return { payload: proposal };
    },

    // Start the interview sub-FSM. Timeline-anchored when a project is linked, else the plain loop.
    // The whole interview runs through its OWN actions + HITL gate; this only opens it and links
    // the session so its completion drives this step.
    interview: async (run) => {
      const ideps = await interviewDeps(userId);
      const title = await fileName(run.file_id);
      const result = run.project_id
        ? await startTimelineInterview(ideps, {
            userId,
            title,
            projectId: run.project_id,
          })
        : await startInterview(ideps, { userId, title });
      return {
        payload: result,
        patch: { interview_session_id: result.sessionId },
      };
    },

    // Review the first record the propose step created from this file. The reviewer runs its own
    // bounded pass; flags are persisted only on the user's acceptReview (its HITL gate).
    review: async (run) => {
      const recordIds = await linkedRecordIds(run.file_id);
      const recordId = recordIds[0];
      if (!recordId) {
        throw new OrchestrationError("no record to review for this file");
      }
      const rdeps = await reviewerDeps(userId);
      return { payload: await startReview(rdeps, { userId, recordId }) };
    },
  };

  return {
    runners,
    loadQueue: async () => buildQueue(await collectSignals(supabase, userId)),
    resolveProjectId: projectForFile,
    repo,
  };
}
