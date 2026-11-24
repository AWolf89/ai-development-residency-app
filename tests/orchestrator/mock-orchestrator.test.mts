// Boundary tests for the thin orchestration layer (ADR-0026): the server-only wiring that drives the
// pure router (machine.ts) by SEQUENCING the existing per-agent PROPOSE entry points — against a
// fake repo and fake runners (no network, no DB). The load-bearing assertions are the composition
// contract: the orchestrator has no save capability in its deps at all, so it cannot persist
// evidence (AC1/AC2 — each agent's own accept-only gate stays the only save path); a failing step
// is resumable with prior steps intact (AC4); and position rehydrates from the persisted row.
// Run: NODE_OPTIONS=--conditions=react-server tsx tests/orchestrator/mock-orchestrator.test.mts
import assert from "node:assert/strict";
import {
  startRun,
  advanceRun,
  completeStep,
  skipStep,
  resumeRun,
  getRun,
  rehydrate,
  type OrchestrationDeps,
  type OrchestrationRepository,
  type StepRunner,
} from "../../src/lib/orchestrator/orchestrator";
import type { OrchestrationRunRow } from "../../src/lib/orchestrator/queries";
import { STEP_ORDER, type StepKey } from "../../src/lib/orchestrator/types";

let pass = 0;
const ok = (c: boolean, m: string) => {
  assert.ok(c, m);
  console.log("ok  ", m);
  pass++;
};

const USER = "user-1";
const OTHER = "user-2";

/** An in-memory repository that records every write, so the test can inspect persisted position. */
function fakeRepo() {
  const rows = new Map<string, OrchestrationRunRow>();
  let seq = 0;
  const repo: OrchestrationRepository = {
    async createRun(row) {
      const id = `run-${++seq}`;
      const now = new Date().toISOString();
      rows.set(id, { id, created_at: now, updated_at: now, ...row });
      return { id };
    },
    async getRun(id) {
      return rows.get(id) ?? null;
    },
    async updateRun(id, patch) {
      const existing = rows.get(id);
      if (existing) rows.set(id, { ...existing, ...patch });
    },
  };
  return { repo, rows };
}

/** Build deps whose runners are pure propose stubs. None can save — there is no save in the deps. */
function fakeDeps(
  overrides?: Partial<Record<StepKey, StepRunner>>,
  opts?: { resolveProjectId?: (fileId: string) => Promise<string | null> }
) {
  const { repo, rows } = fakeRepo();
  const calls: StepKey[] = [];
  let queueLoads = 0;
  const makeRunner =
    (step: StepKey): StepRunner =>
    async () => {
      calls.push(step);
      return { payload: { step, proposed: true } };
    };
  const runners = Object.fromEntries(
    STEP_ORDER.map((s) => [s, overrides?.[s] ?? makeRunner(s)])
  ) as Record<StepKey, StepRunner>;
  const deps: OrchestrationDeps = {
    runners,
    loadQueue: async () => {
      queueLoads++;
      return [
        {
          id: "unreviewed_file:f1",
          kind: "unreviewed_file",
          title: "x",
          detail: "y",
          subjectLabel: "z",
          action: { label: "Open", href: "/dashboard" },
          priority: 60,
        },
      ];
    },
    // By default the propose step created no project, so the interview stays the plain loop.
    resolveProjectId: opts?.resolveProjectId ?? (async () => null),
    repo,
  };
  return { deps, rows, calls, queueLoads: () => queueLoads };
}

/** Run one step to done: advance (propose) then completeStep (the agent's save already fired). */
async function stepThrough(deps: OrchestrationDeps, runId: string) {
  await advanceRun(deps, { runId, userId: USER });
  return completeStep(deps, { runId, userId: USER });
}

// 1. startRun creates a running row at the first step and runs no agent.
{
  const { deps, rows, calls } = fakeDeps();
  const { runId, state } = await startRun(deps, { userId: USER, fileId: "f1" });
  ok(state.status === "running", "start → running");
  ok(state.cursor === STEP_ORDER[0], "cursor at the first step (reconcile)");
  ok(calls.length === 0, "no agent is called on start");
  ok(rows.get(runId)?.file_id === "f1", "the run is anchored to the file");
}

// 2. advanceRun calls ONLY the cursor step's propose runner and opens the review gate.
{
  const { deps, calls } = fakeDeps();
  const { runId } = await startRun(deps, { userId: USER, fileId: "f1" });
  const { state, proposal } = await advanceRun(deps, { runId, userId: USER });
  ok(
    calls.length === 1 && calls[0] === "reconcile",
    "only the reconcile runner ran"
  );
  ok(
    state.status === "awaiting_review",
    "advance → awaiting_review (the review gate)"
  );
  ok(
    state.steps.reconcile === "awaiting_review",
    "the step is marked awaiting_review"
  );
  ok(
    proposal?.step === "reconcile",
    "the agent's proposal is handed back for the user to review"
  );
}

// 3. the whole flow runs reconcile→propose→interview→review→complete; the orchestrator saves nothing.
{
  const { deps, calls, queueLoads } = fakeDeps();
  const { runId } = await startRun(deps, { userId: USER, fileId: "f1" });
  let result;
  for (let i = 0; i < STEP_ORDER.length; i++) {
    result = await stepThrough(deps, runId);
  }
  ok(
    JSON.stringify(calls) === JSON.stringify([...STEP_ORDER]),
    "each agent proposed exactly once, in order"
  );
  ok(
    result!.state.status === "complete",
    "the flow completes after the last step"
  );
  ok(
    result!.queue?.length === 1,
    "the Investigation Queue is surfaced on completion"
  );
  ok(queueLoads() === 1, "the queue is read only once, only on completion");
}

// 4. a run already awaiting_review is not advanced again (the gate is idempotent).
{
  const { deps, calls } = fakeDeps();
  const { runId } = await startRun(deps, { userId: USER, fileId: "f1" });
  await advanceRun(deps, { runId, userId: USER });
  const again = await advanceRun(deps, { runId, userId: USER });
  ok(
    calls.length === 1,
    "the runner is not called a second time while awaiting review"
  );
  ok(again.proposal === null, "no new proposal is produced");
}

// 5. a failing step is marked failed, leaves prior saves intact, and persists the failure (AC4).
{
  const { deps, rows } = fakeDeps({
    propose: async () => {
      throw new Error("model timeout");
    },
  });
  const { runId } = await startRun(deps, { userId: USER, fileId: "f1" });
  await stepThrough(deps, runId); // reconcile → done
  const failed = await advanceRun(deps, { runId, userId: USER }); // propose throws
  ok(failed.state.status === "failed", "a throwing step → failed");
  ok(
    failed.state.failureStep === "propose",
    "the failed step is recorded for resume"
  );
  ok(
    failed.state.steps.reconcile === "done",
    "the prior step's save is untouched"
  );
  ok(
    rows.get(runId)?.status === "failed",
    "the failure is persisted (survives a reload)"
  );
}

// 6. resume re-opens the failed step and the retry runs to the gate.
{
  let attempts = 0;
  const { deps } = fakeDeps({
    propose: async () => {
      attempts++;
      if (attempts === 1) throw new Error("transient");
      return { payload: { ok: true } };
    },
  });
  const { runId } = await startRun(deps, { userId: USER, fileId: "f1" });
  await stepThrough(deps, runId); // reconcile done
  await advanceRun(deps, { runId, userId: USER }); // propose fails
  const resumed = await resumeRun(deps, { runId, userId: USER });
  ok(
    resumed.state.status === "running" && resumed.state.cursor === "propose",
    "resume re-opens the step"
  );
  const retried = await advanceRun(deps, { runId, userId: USER });
  ok(
    retried.state.status === "awaiting_review",
    "the retry reaches the review gate"
  );
  ok(attempts === 2, "the step was retried exactly once");
}

// 7. skip advances without saving the step.
{
  const { deps } = fakeDeps();
  const { runId } = await startRun(deps, { userId: USER, fileId: "f1" });
  const skipped = await skipStep(deps, { runId, userId: USER });
  ok(skipped.state.steps.reconcile === "skipped", "the step is marked skipped");
  ok(skipped.state.cursor === "propose", "the flow advances past a skip");
}

// 8. state rehydrates exactly from the persisted row (durable position).
{
  const { deps, rows } = fakeDeps();
  const { runId } = await startRun(deps, { userId: USER, fileId: "f1" });
  await stepThrough(deps, runId); // reconcile done, cursor at propose
  const state = rehydrate(rows.get(runId)!);
  ok(
    state.cursor === "propose" &&
      state.steps.reconcile === "done" &&
      state.steps.propose === "pending",
    "rehydrate rebuilds the exact position from the row"
  );
  const read = await getRun(deps, { runId, userId: USER });
  ok(
    JSON.stringify(read.state) === JSON.stringify(state),
    "getRun returns the same position"
  );
}

// 9. a run owned by another user is refused (fails closed; RLS is the real guard — AC5).
{
  const { deps } = fakeDeps();
  const { runId } = await startRun(deps, { userId: USER, fileId: "f1" });
  let threw = false;
  try {
    await advanceRun(deps, { runId, userId: OTHER });
  } catch {
    threw = true;
  }
  ok(threw, "another user's run is refused");
}

// 10. accepting the propose step captures the approved project id so the interview is timeline-anchored.
{
  const seenProjectIds: (string | null)[] = [];
  const { deps, rows } = fakeDeps(
    {
      // Record the project id the orchestrator hands the interview step (null = plain loop).
      interview: async (run) => {
        seenProjectIds.push(run.project_id);
        return {
          payload: { step: "interview", proposed: true },
          patch: { interview_session_id: "s-1" },
        };
      },
    },
    { resolveProjectId: async () => "proj-9" }
  );
  const { runId } = await startRun(deps, { userId: USER, fileId: "f1" });
  await stepThrough(deps, runId); // reconcile → done
  ok(rows.get(runId)?.project_id === null, "no project is linked before the propose step is accepted");
  await stepThrough(deps, runId); // propose: advance then accept the HITL save
  ok(
    rows.get(runId)?.project_id === "proj-9",
    "accepting the propose step captures the approved project id on the run"
  );
  await advanceRun(deps, { runId, userId: USER }); // run the interview step's propose entry point
  ok(
    seenProjectIds[0] === "proj-9",
    "the interview step receives the anchored project id (timeline-anchored, ADR-0021)"
  );
}

// 11. accepting a step that created no project leaves project_id null (interview falls back to the plain loop).
{
  const seenProjectIds: (string | null)[] = [];
  const { deps, rows } = fakeDeps(
    {
      interview: async (run) => {
        seenProjectIds.push(run.project_id);
        return { payload: { step: "interview", proposed: true } };
      },
    },
    { resolveProjectId: async () => null }
  );
  const { runId } = await startRun(deps, { userId: USER, fileId: "f1" });
  await stepThrough(deps, runId); // reconcile → done
  await stepThrough(deps, runId); // propose accepted, but no project was created
  ok(
    rows.get(runId)?.project_id === null,
    "no project id is captured when the propose step created none"
  );
  await advanceRun(deps, { runId, userId: USER });
  ok(seenProjectIds[0] === null, "the interview step stays the plain loop with no project");
}

console.log(`\n${pass} checks passed`);
