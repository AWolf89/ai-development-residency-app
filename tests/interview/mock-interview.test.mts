// Boundary tests for the Reasoning Interview orchestrator (ADR-0013): the server-only wiring
// that drives the FSM through retrieval, the model gateway, persistence, and the save-on-accept
// path — against a fake retriever, fake model, fake repo, and fake save (no network, no DB, one
// model path). The load-bearing assertion is HITL: a decision record is written ONLY after
// accept and NEVER during the paraphrase step.
// Run: NODE_OPTIONS=--conditions=react-server tsx tests/interview/mock-interview.test.mts
import assert from "node:assert/strict";
import {
  startInterview,
  submitAnswer,
  skipQuestion,
  acceptDraft,
  editDraft,
  rejectDraft,
  pauseInterview,
  resumeInterview,
  type InterviewDeps,
  type InterviewRepository,
} from "../../src/lib/interview/orchestrator";
import type { CdmDraft } from "../../src/lib/interview/types";
import type {
  InterviewSessionRow,
  InterviewTurnRow,
} from "../../src/lib/interview/queries";
import type { Retrieval } from "../../src/lib/rag/types";

process.env.OPENROUTER_API_KEY = "sk-or-test";

let pass = 0;
const ok = (c: boolean, m: string) => {
  assert.ok(c, m);
  console.log("ok  ", m);
  pass++;
};

const DRAFT: CdmDraft = {
  title: "Chose Postgres",
  situation: "Needed a datastore for the MVP.",
  cue: "Reporting kept coming up.",
  decision: "Picked Postgres.",
  why: "Relational reporting mattered most.",
  outcome: "Shipped on time.",
};

const foundEvidence: Retrieval = {
  found: true,
  context: "[file · plan.pdf] Slide 7: chose a blue/green rollout.",
  sources: [{ source: "file", id: "plan.pdf", title: "plan.pdf" }],
  hits: [],
};
const noEvidence: Retrieval = {
  found: false,
  context: "NO_MATCHING_EVIDENCE_DATA",
  sources: [],
  hits: [],
};

// A tiny in-memory InterviewRepository (RLS is the real thing's job; here it is just storage).
function makeRepo() {
  const sessions = new Map<string, InterviewSessionRow>();
  const turns = new Map<string, InterviewTurnRow>();
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;
  const repo: InterviewRepository = {
    async createSession(row) {
      const sid = id("session");
      sessions.set(sid, {
        id: sid,
        created_at: "t",
        updated_at: "t",
        ...row,
      } as InterviewSessionRow);
      return { id: sid };
    },
    async updateSession(sid, patch) {
      const cur = sessions.get(sid)!;
      sessions.set(sid, { ...cur, ...patch });
    },
    async getSession(sid) {
      return sessions.get(sid) ?? null;
    },
    async getTurns(sid) {
      return [...turns.values()].filter((t) => t.session_id === sid);
    },
    async createTurn(row) {
      const tid = id("turn");
      turns.set(tid, {
        id: tid,
        created_at: `t-${n}`,
        answer_text: null,
        paraphrase: null,
        decision_record_id: null,
        ...row,
      } as InterviewTurnRow);
      return { id: tid };
    },
    async updateTurn(tid, patch) {
      const cur = turns.get(tid)!;
      turns.set(tid, { ...cur, ...patch });
    },
  };
  return { repo, sessions, turns };
}

type Counters = { questions: number; paraphrases: number; saves: number };

function makeDeps(
  overrides: Partial<InterviewDeps> = {},
  evidence: Retrieval = foundEvidence
): {
  deps: InterviewDeps;
  counters: Counters;
  store: ReturnType<typeof makeRepo>;
} {
  const store = makeRepo();
  const counters: Counters = { questions: 0, paraphrases: 0, saves: 0 };
  const deps: InterviewDeps = {
    retrieveEvidence: async () => evidence,
    generateQuestion: async () => {
      counters.questions++;
      return `Question ${counters.questions}?`;
    },
    paraphrase: async () => {
      counters.paraphrases++;
      return DRAFT;
    },
    saveRecord: async () => {
      counters.saves++;
      return { recordId: `rec-${counters.saves}` };
    },
    repo: store.repo,
    ...overrides,
  };
  return { deps, counters, store };
}

// 1. startInterview creates a session + first turn, grounds the question, saves nothing.
{
  const { deps, counters, store } = makeDeps();
  const started = await startInterview(deps, {
    userId: "u1",
    title: "Platform migration",
    questionBudget: 3,
  });
  ok(started.state.status === "awaiting_answer", "start → awaiting_answer");
  ok(counters.questions === 1, "one question generated");
  ok(counters.saves === 0, "nothing saved at start");
  const turns = await store.repo.getTurns(started.sessionId);
  ok(
    turns.length === 1 && turns[0].status === "asked",
    "one asked turn persisted"
  );
  ok(
    turns[0].grounding_citation?.id === "plan.pdf",
    "question turn carries the grounding citation"
  );
}

// 2. submitAnswer paraphrases and reaches confirmation WITHOUT saving (the HITL gate).
{
  const { deps, counters, store } = makeDeps();
  const started = await startInterview(deps, {
    userId: "u1",
    title: "Platform migration",
    questionBudget: 3,
  });
  const after = await submitAnswer(deps, {
    sessionId: started.sessionId,
    userId: "u1",
    answer: "We chose Postgres because reporting mattered.",
  });
  ok(
    after.state.status === "awaiting_confirmation",
    "answer → awaiting_confirmation"
  );
  ok(counters.paraphrases === 1, "paraphrase ran once");
  ok(counters.saves === 0, "NO decision record saved during paraphrase (HITL)");
  const turns = await store.repo.getTurns(started.sessionId);
  ok(
    turns[0].status === "answered" &&
      turns[0].answer_text !== null &&
      turns[0].paraphrase !== null &&
      turns[0].decision_record_id === null,
    "turn holds the answer + draft but no record id yet"
  );
}

// 3. acceptDraft saves EXACTLY one record and stamps the turn, then asks the next question.
{
  const { deps, counters, store } = makeDeps();
  const started = await startInterview(deps, {
    userId: "u1",
    title: "Platform migration",
    questionBudget: 3,
  });
  await submitAnswer(deps, {
    sessionId: started.sessionId,
    userId: "u1",
    answer: "We chose Postgres.",
  });
  const accepted = await acceptDraft(deps, {
    sessionId: started.sessionId,
    userId: "u1",
  });
  ok(counters.saves === 1, "accept saves exactly one decision record");
  ok(
    accepted.state.status === "awaiting_answer",
    "after save, the next question is asked (budget remains)"
  );
  const turns = await store.repo.getTurns(started.sessionId);
  const saved = turns.find((t) => t.status === "saved");
  ok(
    saved?.decision_record_id === "rec-1",
    "the saved turn is stamped with the decision_record_id"
  );
}

// 4. rejectDraft and editDraft never save.
{
  const { deps, counters } = makeDeps();
  const s = await startInterview(deps, {
    userId: "u1",
    title: "x",
    questionBudget: 3,
  });
  await submitAnswer(deps, {
    sessionId: s.sessionId,
    userId: "u1",
    answer: "a",
  });
  const rejected = await rejectDraft(deps, {
    sessionId: s.sessionId,
    userId: "u1",
  });
  ok(counters.saves === 0, "reject saves nothing");
  ok(rejected.state.status === "awaiting_answer", "reject → next question");
}
{
  const { deps, counters, store } = makeDeps();
  const s = await startInterview(deps, {
    userId: "u1",
    title: "x",
    questionBudget: 3,
  });
  await submitAnswer(deps, {
    sessionId: s.sessionId,
    userId: "u1",
    answer: "a",
  });
  const edited = await editDraft(deps, {
    sessionId: s.sessionId,
    userId: "u1",
  });
  ok(counters.saves === 0, "edit saves nothing");
  ok(
    edited.state.status === "awaiting_answer",
    "edit → back to the same question to re-answer"
  );
  const turns = await store.repo.getTurns(s.sessionId);
  ok(turns[0].status === "asked", "edited turn is awaiting an answer again");
}

// 5. An empty answer is a skip: no paraphrase, no save, straight to the next question.
{
  const { deps, counters } = makeDeps();
  const s = await startInterview(deps, {
    userId: "u1",
    title: "x",
    questionBudget: 3,
  });
  const skipped = await submitAnswer(deps, {
    sessionId: s.sessionId,
    userId: "u1",
    answer: "   ",
  });
  ok(counters.paraphrases === 0, "empty answer does not paraphrase");
  ok(counters.saves === 0, "empty answer saves nothing");
  ok(skipped.state.status === "awaiting_answer", "skip → next question");
}

// 6. skipQuestion advances without paraphrase or save.
{
  const { deps, counters } = makeDeps();
  const s = await startInterview(deps, {
    userId: "u1",
    title: "x",
    questionBudget: 3,
  });
  const skipped = await skipQuestion(deps, {
    sessionId: s.sessionId,
    userId: "u1",
  });
  ok(counters.saves === 0 && counters.paraphrases === 0, "skip saves nothing");
  ok(
    skipped.state.status === "awaiting_answer",
    "skipQuestion → next question"
  );
}

// 7. The circuit breaker: a paraphrase that keeps failing pauses instead of saving.
{
  const { deps, counters, store } = makeDeps({
    paraphrase: async () => {
      throw new Error("model down");
    },
  });
  const s = await startInterview(deps, {
    userId: "u1",
    title: "x",
    questionBudget: 3,
  });
  const result = await submitAnswer(deps, {
    sessionId: s.sessionId,
    userId: "u1",
    answer: "a",
  });
  ok(result.state.status === "paused", "repeated paraphrase failure → paused");
  ok(counters.saves === 0, "breaker never saves");
  const session = await store.repo.getSession(s.sessionId);
  ok(session?.status === "paused", "the session is persisted as paused");
}

// 8. Budget: with a budget of 1, accepting the first record completes the interview.
{
  const { deps } = makeDeps();
  const s = await startInterview(deps, {
    userId: "u1",
    title: "x",
    questionBudget: 1,
  });
  await submitAnswer(deps, {
    sessionId: s.sessionId,
    userId: "u1",
    answer: "a",
  });
  const accepted = await acceptDraft(deps, {
    sessionId: s.sessionId,
    userId: "u1",
  });
  ok(
    accepted.state.status === "complete",
    "budget of 1 completes after one save"
  );
}

// 9. No evidence → ungrounded open question, null citation stored.
{
  const { deps, store } = makeDeps({}, noEvidence);
  const s = await startInterview(deps, {
    userId: "u1",
    title: "x",
    questionBudget: 3,
  });
  ok(
    s.state.status === "awaiting_answer",
    "still asks when there is no evidence"
  );
  const turns = await store.repo.getTurns(s.sessionId);
  ok(
    turns[0].grounding_citation === null,
    "ungrounded question stores a null citation"
  );
}

// 10. pause then resume: paused, then a fresh question on resume.
{
  const { deps, store } = makeDeps();
  const s = await startInterview(deps, {
    userId: "u1",
    title: "x",
    questionBudget: 3,
  });
  const paused = await pauseInterview(deps, {
    sessionId: s.sessionId,
    userId: "u1",
  });
  ok(paused.state.status === "paused", "pause → paused");
  ok(
    (await store.repo.getSession(s.sessionId))?.status === "paused",
    "session persisted paused"
  );
  const resumed = await resumeInterview(deps, {
    sessionId: s.sessionId,
    userId: "u1",
  });
  ok(resumed.state.status === "awaiting_answer", "resume → asks again");
}

console.log(`\n${pass} checks passed`);
