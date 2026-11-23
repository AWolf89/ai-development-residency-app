// Boundary tests for Auto-propose project & evidence records (MVP 2 Phase 2): the single writer
// (persistProposal) against fake saveProject/saveDecisionRecord, plus the HITL invariant that the
// writer is reached ONLY from the FSM's `persisting` state, which is reachable ONLY via `approve`.
// Load-bearing assertions (ADR-0013): zero project/record writes during propose/edit/reject; on
// approve, exactly one project + N records with the project id threaded and each record linked to
// the file at its cited passage; a failed project save writes no records; re-approve is inert.
// Run: NODE_OPTIONS=--conditions=react-server tsx tests/file-analysis/mock-proposal.test.mts
import assert from "node:assert/strict";
import {
  persistProposal,
  ProposalPersistError,
  type ProposalPersistDeps,
} from "../../src/lib/file-analysis/proposal/persist";
import {
  createProposal,
  reduce,
} from "../../src/lib/file-analysis/proposal/machine";
import type {
  ProposalEvent,
  ProposalState,
  ProposedProject,
  ProposedRecord,
} from "../../src/lib/file-analysis/proposal/types";
import type { SaveProjectParams } from "../../src/lib/projects/save";
import type { SaveDecisionRecordParams } from "../../src/lib/decision-records/save";

let pass = 0;
const ok = (c: boolean, m: string) => {
  assert.ok(c, m);
  console.log("ok  ", m);
  pass++;
};

const PROJECT: ProposedProject = {
  name: "Onboarding redesign",
  organisation: "Acme",
  startedOn: "2024-01-01",
  endedOn: "2024-03-01",
  summary: "Redesigned onboarding.",
};
const RECORDS: ProposedRecord[] = [
  {
    title: "Led the pilot",
    situation: "Processing was slow.",
    cue: null,
    decision: "Piloted a shorter form.",
    why: null,
    outcome: "Pilot ran with two teams.",
    contribution: "individual",
    location: "p. 2",
    confidence: "high",
  },
  {
    title: "Wrote the guide",
    situation: "Staff were unsure of the new flow.",
    cue: null,
    decision: "Wrote a one-page guide.",
    why: null,
    outcome: "Adopted by both teams.",
    contribution: "team",
    location: "p. 5",
    confidence: "medium",
  },
];

type Counters = {
  projectSaves: number;
  recordSaves: number;
  projectArgs: SaveProjectParams[];
  recordArgs: SaveDecisionRecordParams[];
};

function makeDeps(opts: { projectOk?: boolean; recordOk?: boolean } = {}): {
  deps: ProposalPersistDeps;
  counters: Counters;
} {
  const counters: Counters = {
    projectSaves: 0,
    recordSaves: 0,
    projectArgs: [],
    recordArgs: [],
  };
  const deps: ProposalPersistDeps = {
    async saveProject(params) {
      counters.projectSaves++;
      counters.projectArgs.push(params);
      return opts.projectOk === false
        ? { ok: false, error: "project failed" }
        : { ok: true, projectId: "proj-1" };
    },
    async saveDecisionRecord(params) {
      counters.recordSaves++;
      counters.recordArgs.push(params);
      return opts.recordOk === false
        ? { ok: false, error: "record failed" }
        : { ok: true, recordId: `rec-${counters.recordSaves}` };
    },
  };
  return { deps, counters };
}

// A stand-in for the orchestrator's one side-effecting branch: persist ONLY in `persisting`.
async function runSideEffects(
  state: ProposalState,
  deps: ProposalPersistDeps,
  userId = "user-1"
) {
  if (state.status === "persisting") {
    return persistProposal(deps, {
      userId,
      fileId: state.fileId,
      project: state.project,
      records: state.records,
    });
  }
  return null;
}

function review(): ProposalState {
  return reduce(createProposal({ fileId: "file-1" }), {
    type: "proposed",
    project: PROJECT,
    records: RECORDS,
    questions: [],
  });
}

async function main() {
  // 1) Approve persists exactly one project + N records, project id threaded, file+passage linked.
  {
    const { deps, counters } = makeDeps();
    const persisting = reduce(review(), { type: "approve" });
    const result = await runSideEffects(persisting, deps);
    ok(counters.projectSaves === 1, "approve: project saved exactly once");
    ok(
      counters.recordSaves === RECORDS.length,
      "approve: each record saved once"
    );
    ok(
      counters.recordArgs.every((a) => a.projectId === "proj-1"),
      "approve: the new project id is threaded into every record"
    );
    ok(
      counters.recordArgs[0].fileId === "file-1" &&
        counters.recordArgs[0].location === "p. 2",
      "approve: each record links the file at its cited passage"
    );
    ok(
      result?.projectId === "proj-1" && result.recordIds.length === 2,
      "approve: returns the created project + record ids"
    );
  }

  // 2) HITL: no write happens in any non-persisting state (propose, edit, reject, clarify).
  {
    const nonPersisting: ProposalEvent[] = [
      { type: "edit", project: null, records: [] },
      { type: "reject" },
    ];
    for (const event of nonPersisting) {
      const { deps, counters } = makeDeps();
      const next = reduce(review(), event);
      await runSideEffects(next, deps);
      ok(
        counters.projectSaves === 0 && counters.recordSaves === 0,
        `no write on '${event.type}' (stays ${next.status})`
      );
    }
    // The freshly-proposed review state itself writes nothing.
    const { deps, counters } = makeDeps();
    await runSideEffects(review(), deps);
    ok(
      counters.projectSaves === 0 && counters.recordSaves === 0,
      "no write while awaiting review"
    );
  }

  // 3) A null project skips the project save but still persists the records (unassigned).
  {
    const { deps, counters } = makeDeps();
    const persisting = reduce(
      reduce(createProposal({ fileId: "file-1" }), {
        type: "proposed",
        project: null,
        records: RECORDS,
        questions: [],
      }),
      { type: "approve" }
    );
    const result = await runSideEffects(persisting, deps);
    ok(counters.projectSaves === 0, "null project: no project save");
    ok(counters.recordSaves === 2, "null project: records still saved");
    ok(
      counters.recordArgs.every((a) => a.projectId === null),
      "null project: records saved with project id null"
    );
    ok(result?.projectId === null, "null project: result project id is null");
  }

  // 4) A failed project save throws and writes no records (nothing half-saved, AC5).
  {
    const { deps, counters } = makeDeps({ projectOk: false });
    const persisting = reduce(review(), { type: "approve" });
    let threw = false;
    try {
      await runSideEffects(persisting, deps);
    } catch (err) {
      threw = err instanceof ProposalPersistError;
    }
    ok(threw, "failed project save throws ProposalPersistError");
    ok(counters.recordSaves === 0, "failed project save: no records written");
  }

  // 5) Re-approve is inert: from `complete`, approve is ignored, so no second write.
  {
    const { deps, counters } = makeDeps();
    const complete = reduce(reduce(review(), { type: "approve" }), {
      type: "persisted",
      result: { projectId: "proj-1", recordIds: ["rec-1", "rec-2"] },
    });
    const next = reduce(complete, { type: "approve" }); // ignored (terminal)
    await runSideEffects(next, deps);
    ok(
      counters.projectSaves === 0 && counters.recordSaves === 0,
      "re-approve after complete writes nothing"
    );
  }

  console.log(`\n${pass} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
