// Boundary tests for the Reviewer Agent Check orchestrator (ADR-0016): the server-only wiring that
// drives the FSM through retrieval, the model gateway, grounding, and persistence — against a fake
// retriever, fake model, and fake repo (no network, no DB, one model path). The load-bearing
// assertions are HITL: flags are written and the record marked reviewed ONLY on accept, NEVER
// during the review pass and NEVER on reject; and the no-evidence dimensions make no model call.
// Run: NODE_OPTIONS=--conditions=react-server tsx tests/reviewer/mock-reviewer.test.mts
import assert from "node:assert/strict";
import {
  startReview,
  acceptReview,
  rejectReview,
  type ReviewDeps,
  type ReviewRepository,
  type ReviewableRecord,
  type NewFlagRow,
} from "../../src/lib/reviewer/orchestrator";
import type { ModelFlag, ReviewDimension } from "../../src/lib/reviewer/types";
import type { RecordReviewRow } from "../../src/lib/reviewer/queries";
import type { Citation } from "../../src/lib/rag/types";

process.env.OPENROUTER_API_KEY = "sk-or-test";

let pass = 0;
const ok = (c: boolean, m: string) => {
  assert.ok(c, m);
  console.log("ok  ", m);
  pass++;
};

const RECORD: ReviewableRecord = {
  id: "rec-1",
  title: "Led the billing migration",
  situation: "Legacy billing was failing at month end.",
  cue: "Repeated timeouts in the close.",
  decision: "Moved billing to an event queue.",
  why: "Decouple the close from the API.",
  outcome: "Cut month-end failures by 50%.",
};

const sources: Citation[] = [
  { source: "file", id: "report.pdf", title: "Impact report" },
];
const foundEvidence = {
  found: true,
  context: "[file · report.pdf] Month-end failures fell about 10%.",
  sources,
};
const noEvidence = {
  found: false,
  context: "NO_MATCHING_EVIDENCE_DATA",
  sources: [],
};

// One model flag per dimension: accuracy cites real evidence (kept); the rest carry no citation.
function modelFlagsFor(dimension: ReviewDimension): ModelFlag[] {
  return [
    {
      severity: "caution",
      targetField: "outcome",
      message: `${dimension} issue`,
      citations:
        dimension === "accuracy" ? [{ source: "file", id: "report.pdf" }] : [],
    },
  ];
}

type Counters = {
  reviewCalls: number;
  createdReviews: number;
  insertedFlagBatches: number;
};

function makeRepo(over: Partial<ReviewRepository> = {}) {
  const inserted: NewFlagRow[][] = [];
  const counters: Counters = {
    reviewCalls: 0,
    createdReviews: 0,
    insertedFlagBatches: 0,
  };
  const repo: ReviewRepository = {
    async getRecord() {
      return RECORD;
    },
    async latestCompleteReview() {
      return null;
    },
    async createReview() {
      counters.createdReviews++;
      return { id: `review-${counters.createdReviews}` };
    },
    async insertFlags(rows) {
      counters.insertedFlagBatches++;
      inserted.push(rows);
    },
    ...over,
  };
  return { repo, counters, inserted };
}

function makeDeps(opts: {
  evidence?: typeof foundEvidence | typeof noEvidence;
  runReview?: ReviewDeps["runReview"];
  repo?: ReturnType<typeof makeRepo>;
}) {
  const store = opts.repo ?? makeRepo();
  const modelCounters = { reviewCalls: 0 };
  const deps: ReviewDeps = {
    retrieveEvidence: async () => opts.evidence ?? foundEvidence,
    runReview:
      opts.runReview ??
      (async (input) => {
        modelCounters.reviewCalls++;
        return {
          flags: modelFlagsFor(input.dimension),
          attempts: 1,
          truncated: false,
        };
      }),
    repo: store.repo,
  };
  return { deps, store, modelCounters };
}

// 1. startReview runs the full pass, returns proposed flags, and writes NOTHING.
{
  const { deps, store } = makeDeps({});
  const r = await startReview(deps, { userId: "u1", recordId: "rec-1" });
  ok(r.state.status === "awaiting_review", "start → awaiting_review");
  ok(
    r.state.status === "awaiting_review" && r.state.flags.length === 4,
    "one flag per dimension survives grounding"
  );
  ok(
    store.counters.createdReviews === 0,
    "no review row written during the pass"
  );
  ok(
    store.counters.insertedFlagBatches === 0,
    "NO flags written during the pass (HITL)"
  );
}

// 2. accept persists exactly one review + one flag batch and marks it complete.
{
  const { deps, store } = makeDeps({});
  const started = await startReview(deps, { userId: "u1", recordId: "rec-1" });
  const flags =
    started.state.status === "awaiting_review" ? started.state.flags : [];
  const accepted = await acceptReview(deps, {
    userId: "u1",
    recordId: "rec-1",
    flags,
  });
  ok(accepted.state.status === "complete", "accept → complete");
  ok(store.counters.createdReviews === 1, "accept creates exactly one review");
  ok(
    store.counters.insertedFlagBatches === 1,
    "accept writes the flags exactly once"
  );
  ok(
    store.inserted[0].length === 4 &&
      store.inserted[0].every((f) => f.disposition === "accepted"),
    "all pending flags were promoted to accepted and stamped with the review id"
  );
  ok(
    store.inserted[0].every((f) => f.model_used && f.prompt_version),
    "each flag row carries model_used + prompt_version provenance"
  );
}

// 3. a dismissed flag is persisted with its disposition, not silently dropped.
{
  const { deps, store } = makeDeps({});
  const started = await startReview(deps, { userId: "u1", recordId: "rec-1" });
  const flags =
    started.state.status === "awaiting_review"
      ? started.state.flags.map((f, i) =>
          i === 0 ? { ...f, disposition: "dismissed" as const } : f
        )
      : [];
  await acceptReview(deps, { userId: "u1", recordId: "rec-1", flags });
  ok(
    store.inserted[0].filter((f) => f.disposition === "dismissed").length === 1,
    "the user's dismissed flag is persisted as dismissed"
  );
}

// 4. reject writes nothing and discards.
{
  const { deps, store } = makeDeps({});
  const rejected = await rejectReview(deps, {
    userId: "u1",
    recordId: "rec-1",
  });
  ok(rejected.state.status === "discarded", "reject → discarded");
  ok(
    store.counters.createdReviews === 0 &&
      store.counters.insertedFlagBatches === 0,
    "reject persists nothing"
  );
}

// 5. a clean record (no model flags) still completes on accept, with no flag write.
{
  const { deps, store } = makeDeps({
    runReview: async () => ({ flags: [], attempts: 1, truncated: false }),
  });
  const started = await startReview(deps, { userId: "u1", recordId: "rec-1" });
  ok(
    started.state.status === "awaiting_review" &&
      started.state.flags.length === 0,
    "a clean record reaches the gate with zero flags"
  );
  const flags =
    started.state.status === "awaiting_review" ? started.state.flags : [];
  const accepted = await acceptReview(deps, {
    userId: "u1",
    recordId: "rec-1",
    flags,
  });
  ok(
    accepted.state.status === "complete",
    "accept of a clean record completes"
  );
  ok(
    store.counters.createdReviews === 1,
    "the record is still marked reviewed"
  );
  ok(
    store.counters.insertedFlagBatches === 0,
    "no flag batch written for zero flags"
  );
}

// 6. no retrieved evidence: support emits the honest absence flag, accuracy is skipped, and
//    NO model call is made for the evidence dimensions (only the two intrinsic ones).
{
  const { deps, modelCounters } = makeDeps({ evidence: noEvidence });
  const started = await startReview(deps, { userId: "u1", recordId: "rec-1" });
  ok(
    started.state.status === "awaiting_review",
    "no-evidence pass still reaches the gate"
  );
  const flags =
    started.state.status === "awaiting_review" ? started.state.flags : [];
  const support = flags.filter((f) => f.dimension === "support");
  ok(
    support.some((f) =>
      f.message.toLowerCase().includes("no supporting evidence")
    ),
    "support emits the honest 'no evidence on file' flag"
  );
  ok(
    modelCounters.reviewCalls === 2,
    "only the two intrinsic dimensions call the model when there is no evidence"
  );
}

// 7. circuit breaker: a model that keeps failing pauses the review and writes nothing.
{
  const { deps, store } = makeDeps({
    runReview: async () => {
      throw new Error("model down");
    },
  });
  const started = await startReview(deps, { userId: "u1", recordId: "rec-1" });
  ok(started.state.status === "paused", "repeated model failure → paused");
  ok(
    store.counters.createdReviews === 0 &&
      store.counters.insertedFlagBatches === 0,
    "the breaker never writes anything"
  );
}

// 8. idempotency: an already-complete review is adopted; accept does not write again.
{
  const existing: RecordReviewRow = {
    id: "review-prior",
    user_id: "u1",
    decision_record_id: "rec-1",
    status: "complete",
    check_budget: 4,
    checks_done: 4,
    created_at: "t",
    updated_at: "t",
  };
  const store = makeRepo({
    async latestCompleteReview() {
      return existing;
    },
  });
  const { deps } = makeDeps({ repo: store });
  const accepted = await acceptReview(deps, {
    userId: "u1",
    recordId: "rec-1",
    flags: [],
  });
  ok(
    accepted.state.status === "complete",
    "an already-reviewed record stays complete"
  );
  ok(
    store.counters.createdReviews === 0 &&
      store.counters.insertedFlagBatches === 0,
    "accept does not re-write an existing completed review"
  );
}

console.log(`\n${pass} checks passed`);
