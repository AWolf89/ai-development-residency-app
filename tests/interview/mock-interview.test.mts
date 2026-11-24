// Boundary tests for the Reasoning Interview orchestrator (ADR-0013): the server-only wiring
// that drives the FSM through retrieval, the model gateway, persistence, and the save-on-accept
// path — against a fake retriever, fake model, fake repo, and fake save (no network, no DB, one
// model path). The load-bearing assertion is HITL: a decision record is written ONLY after
// accept and NEVER during the paraphrase step.
// Run: NODE_OPTIONS=--conditions=react-server tsx tests/interview/mock-interview.test.mts
import assert from "node:assert/strict";
import {
  startInterview,
  startTimelineInterview,
  confirmTimeline,
  submitAnswer,
  skipQuestion,
  acceptDraft,
  editDraft,
  rejectDraft,
  acceptLearningMoment,
  rejectLearningMoment,
  pauseInterview,
  resumeInterview,
  type InterviewDeps,
  type InterviewRepository,
} from "../../src/lib/interview/orchestrator";
import type {
  CdmDraft,
  LearningMomentDraft,
} from "../../src/lib/interview/types";
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
    async getTurn(tid) {
      return turns.get(tid) ?? null;
    },
    async createTurn(row) {
      const tid = id("turn");
      turns.set(tid, {
        id: tid,
        created_at: `t-${n}`,
        answer_text: null,
        paraphrase: null,
        decision_record_id: null,
        learning_moment_draft: null,
        learning_moment_id: null,
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

type Counters = {
  questions: number;
  paraphrases: number;
  saves: number;
  classifies: number;
  detects: number;
  lmSaves: number;
};

const LM_DRAFT: LearningMomentDraft = {
  kind: "pivot",
  context: "Mid-migration the dual-write kept drifting.",
  shift: "Switched to a read-repair backfill.",
  result: "Cutover drift dropped to zero.",
  duration: null,
};

function makeDeps(
  overrides: Partial<InterviewDeps> = {},
  evidence: Retrieval = foundEvidence
): {
  deps: InterviewDeps;
  counters: Counters;
  store: ReturnType<typeof makeRepo>;
} {
  const store = makeRepo();
  const counters: Counters = {
    questions: 0,
    paraphrases: 0,
    saves: 0,
    classifies: 0,
    detects: 0,
    lmSaves: 0,
  };
  const deps: InterviewDeps = {
    retrieveEvidence: async () => evidence,
    generateQuestion: async () => {
      counters.questions++;
      return `Question ${counters.questions}?`;
    },
    classifyAnswer: async () => {
      counters.classifies++;
      return { kind: "events", redirect: null };
    },
    paraphrase: async () => {
      counters.paraphrases++;
      return DRAFT;
    },
    // Default: NO learning moment detected — the existing scenarios behave exactly as before.
    detectLearningMoment: async () => {
      counters.detects++;
      return null;
    },
    listProjectFiles: async () => [],
    saveRecord: async () => {
      counters.saves++;
      return { recordId: `rec-${counters.saves}` };
    },
    saveLearningMoment: async () => {
      counters.lmSaves++;
      return { recordId: `lm-${counters.lmSaves}` };
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

// 11. Idempotent save: a turn that already has a decision_record_id is never saved twice.
{
  const { deps, counters, store } = makeDeps();
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
  // Simulate a concurrent/earlier accept that already produced the record for this turn.
  const answered = [...store.turns.values()].find(
    (t) => t.status === "answered"
  )!;
  store.turns.set(answered.id, {
    ...answered,
    decision_record_id: "rec-prior",
  });
  const accepted = await acceptDraft(deps, {
    sessionId: s.sessionId,
    userId: "u1",
  });
  ok(
    counters.saves === 0,
    "accept does not re-save a turn that already has a record"
  );
  ok(
    accepted.state.status === "complete",
    "the already-saved turn is adopted and the interview completes"
  );
  const turn = [...store.turns.values()].find((t) => t.id === answered.id)!;
  ok(
    turn.decision_record_id === "rec-prior",
    "the existing record id is kept, not overwritten by a second save"
  );
}

// 12. Resume recovers a captured answer when the breaker tripped during paraphrasing.
{
  const store = makeRepo();
  const counters: Counters = {
    questions: 0,
    paraphrases: 0,
    saves: 0,
    classifies: 0,
    detects: 0,
    lmSaves: 0,
  };
  let paraphraseWorks = false;
  const deps: InterviewDeps = {
    retrieveEvidence: async () => foundEvidence,
    generateQuestion: async () => {
      counters.questions++;
      return `Q${counters.questions}?`;
    },
    classifyAnswer: async () => {
      counters.classifies++;
      return { kind: "events", redirect: null };
    },
    paraphrase: async () => {
      if (!paraphraseWorks) throw new Error("model down");
      counters.paraphrases++;
      return DRAFT;
    },
    detectLearningMoment: async () => {
      counters.detects++;
      return null;
    },
    listProjectFiles: async () => [],
    saveRecord: async () => {
      counters.saves++;
      return { recordId: `rec-${counters.saves}` };
    },
    saveLearningMoment: async () => {
      counters.lmSaves++;
      return { recordId: `lm-${counters.lmSaves}` };
    },
    repo: store.repo,
  };
  const s = await startInterview(deps, {
    userId: "u1",
    title: "x",
    questionBudget: 3,
  });
  const paused = await submitAnswer(deps, {
    sessionId: s.sessionId,
    userId: "u1",
    answer: "we chose postgres",
  });
  ok(
    paused.state.status === "paused",
    "paraphrase failure pauses the interview"
  );
  const stranded = [...store.turns.values()].find(
    (t) => t.status === "answered"
  );
  ok(
    !!stranded &&
      stranded.answer_text === "we chose postgres" &&
      stranded.paraphrase === null,
    "the answer is captured on the turn but has no draft yet"
  );
  // The model recovers; resuming re-paraphrases that same answer instead of abandoning it.
  paraphraseWorks = true;
  const resumed = await resumeInterview(deps, {
    sessionId: s.sessionId,
    userId: "u1",
  });
  ok(
    resumed.state.status === "awaiting_confirmation",
    "resume re-paraphrases the stranded answer back to the confirmation gate"
  );
  ok(
    counters.saves === 0,
    "recovery paraphrase still saves nothing (HITL gate holds)"
  );
  const recovered = [...store.turns.values()].find(
    (t) => t.answer_text === "we chose postgres"
  )!;
  ok(recovered.paraphrase !== null, "the recovered turn now holds the draft");
}

// 13. Timeline interview (ADR-0021): draft from files → awaiting_timeline → confirm → anchored.
{
  let lastPoint: { label: string; date: string | null } | null | undefined;
  const { deps, counters, store } = makeDeps({
    listProjectFiles: async () => [
      { id: "f1", name: "Kickoff.pdf", createdAt: "2026-10-01" },
      { id: "f2", name: "Launch v2.pdf", createdAt: "2026-11-01" },
    ],
    generateQuestion: async (input) => {
      lastPoint = input.decisionPoint;
      counters.questions++;
      return "What did you notice?";
    },
  });
  const started = await startTimelineInterview(deps, {
    userId: "u1",
    title: "Platform migration",
    projectId: "p1",
    questionBudget: 8,
  });
  if (started.state.status !== "awaiting_timeline") {
    throw new Error("expected awaiting_timeline");
  }
  ok(true, "timeline interview starts awaiting timeline review");
  ok(
    started.state.timeline.length === 2,
    "timeline drafted from the project files"
  );
  ok(
    counters.questions === 0,
    "no question asked before the timeline is confirmed"
  );
  const turns0 = await store.repo.getTurns(started.sessionId);
  ok(turns0.length === 0, "no turns yet during the timeline phase");

  const confirmed = await confirmTimeline(deps, {
    sessionId: started.sessionId,
    userId: "u1",
    timeline: started.state.timeline,
  });
  ok(
    confirmed.state.status === "awaiting_answer",
    "confirming the timeline starts the question loop"
  );
  ok(
    !!lastPoint && lastPoint.label === "Kickoff",
    "the first question is anchored to the first decision point"
  );
  const session = await store.repo.getSession(started.sessionId);
  ok(
    session?.timeline?.length === 2,
    "the confirmed timeline is persisted on the session"
  );
}

// 14. Conclusion redirect (ADR-0021): a conclusion answer is re-asked, budget-neutral, no save.
{
  const { deps, counters, store } = makeDeps({
    classifyAnswer: async () => ({
      kind: "conclusion",
      redirect: "What did you observe at that point?",
    }),
  });
  const s = await startInterview(deps, {
    userId: "u1",
    title: "x",
    questionBudget: 3,
  });
  const after = await submitAnswer(deps, {
    sessionId: s.sessionId,
    userId: "u1",
    answer: "it went great",
  });
  if (after.state.status !== "awaiting_answer") {
    throw new Error("expected awaiting_answer after a conclusion");
  }
  ok(true, "a conclusion answer is sent back to the same question");
  ok(
    after.state.redirectHint === "What did you observe at that point?",
    "the redirect hint is surfaced to the user"
  );
  ok(after.state.askedCount === 1, "a redirect does not spend a question");
  ok(counters.paraphrases === 0, "a redirected answer is never paraphrased");
  ok(counters.saves === 0, "a redirected answer saves nothing");
  const turns = await store.repo.getTurns(s.sessionId);
  ok(turns[0].status === "asked", "the turn is re-opened for another answer");
  ok(
    turns[0].question_text === "What did you observe at that point?",
    "the on-screen question becomes the guide-back question"
  );
}

// 15. No learning signal (the default): no second gate, straight to the next question (AC4).
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
    answer: "We chose Postgres.",
  });
  const accepted = await acceptDraft(deps, {
    sessionId: s.sessionId,
    userId: "u1",
  });
  ok(counters.detects === 1, "the detector ran once on the answer");
  ok(
    accepted.state.status === "awaiting_answer",
    "no learning moment → next question, no second gate"
  );
  ok(counters.lmSaves === 0, "no learning moment saved when none was detected");
}

// 16. A detected learning moment pauses at the second gate and saves NOTHING yet (HITL).
{
  const { deps, counters, store } = makeDeps({
    detectLearningMoment: async () => {
      counters.detects++;
      return LM_DRAFT;
    },
  });
  const s = await startInterview(deps, {
    userId: "u1",
    title: "x",
    questionBudget: 3,
  });
  await submitAnswer(deps, {
    sessionId: s.sessionId,
    userId: "u1",
    answer: "I switched approaches when the dual-write drifted.",
  });
  const accepted = await acceptDraft(deps, {
    sessionId: s.sessionId,
    userId: "u1",
  });
  ok(
    accepted.state.status === "awaiting_learning_moment",
    "a detected moment stops at the second gate after the record is saved"
  );
  ok(counters.saves === 1, "the decision record was saved (first gate)");
  ok(
    counters.lmSaves === 0,
    "NO learning moment saved at the gate (HITL — awaits accept)"
  );
  const saved = (await store.repo.getTurns(s.sessionId)).find(
    (t) => t.status === "saved"
  )!;
  ok(
    saved.learning_moment_draft !== null && saved.learning_moment_id === null,
    "the turn holds the proposed moment but no saved id yet"
  );
}

// 17. Accepting the proposed moment saves EXACTLY one, stamps the turn, and continues.
{
  const { deps, counters, store } = makeDeps({
    detectLearningMoment: async () => {
      counters.detects++;
      return LM_DRAFT;
    },
  });
  const s = await startInterview(deps, {
    userId: "u1",
    title: "x",
    questionBudget: 3,
  });
  await submitAnswer(deps, {
    sessionId: s.sessionId,
    userId: "u1",
    answer: "I switched approaches.",
  });
  await acceptDraft(deps, { sessionId: s.sessionId, userId: "u1" });
  const done = await acceptLearningMoment(deps, {
    sessionId: s.sessionId,
    userId: "u1",
  });
  ok(counters.lmSaves === 1, "accepting the moment saves exactly one");
  ok(
    done.state.status === "awaiting_answer",
    "after the moment is saved, the next question is asked"
  );
  const stamped = (await store.repo.getTurns(s.sessionId)).find(
    (t) => t.learning_moment_id === "lm-1"
  );
  ok(!!stamped, "the turn is stamped with the saved learning_moment_id");
}

// 18. Dismissing the proposed moment saves nothing and continues.
{
  const { deps, counters } = makeDeps({
    detectLearningMoment: async () => {
      counters.detects++;
      return LM_DRAFT;
    },
  });
  const s = await startInterview(deps, {
    userId: "u1",
    title: "x",
    questionBudget: 3,
  });
  await submitAnswer(deps, {
    sessionId: s.sessionId,
    userId: "u1",
    answer: "I switched approaches.",
  });
  await acceptDraft(deps, { sessionId: s.sessionId, userId: "u1" });
  const dismissed = await rejectLearningMoment(deps, {
    sessionId: s.sessionId,
    userId: "u1",
  });
  ok(counters.lmSaves === 0, "dismiss saves no learning moment");
  ok(dismissed.state.status === "awaiting_answer", "dismiss → next question");
}

// 19. Idempotent moment save: a turn already stamped is never saved twice.
{
  const { deps, counters, store } = makeDeps({
    detectLearningMoment: async () => {
      counters.detects++;
      return LM_DRAFT;
    },
  });
  const s = await startInterview(deps, {
    userId: "u1",
    title: "x",
    questionBudget: 3,
  });
  await submitAnswer(deps, {
    sessionId: s.sessionId,
    userId: "u1",
    answer: "I switched approaches.",
  });
  await acceptDraft(deps, { sessionId: s.sessionId, userId: "u1" });
  // Simulate the moment already saved for this turn (a prior/concurrent accept).
  const savedTurn = [...store.turns.values()].find(
    (t) => t.learning_moment_draft !== null
  )!;
  store.turns.set(savedTurn.id, {
    ...savedTurn,
    learning_moment_id: "lm-prior",
  });
  const again = await acceptLearningMoment(deps, {
    sessionId: s.sessionId,
    userId: "u1",
  });
  ok(
    counters.lmSaves === 0,
    "accept does not re-save a turn that already has a learning moment"
  );
  ok(
    again.state.status === "awaiting_answer",
    "the already-saved moment is adopted and the loop continues"
  );
}

console.log(`\n${pass} checks passed`);
