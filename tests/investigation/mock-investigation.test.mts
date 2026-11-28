// Boundary tests for the Evidence Investigation Agent orchestrator (ADR-0015): the server-only
// wiring that drives the FSM through retrieval, the reflect model call, grounded citation
// validation, and the gated UPSERT — against a fake retriever, fake model, and fake save (no
// network, no DB, one model path). The load-bearing assertion is HITL + grounding: an assessment
// is written ONLY on acceptFinding, NEVER during the review pass or on reject, and a finding can
// never cite evidence that was not retrieved.
// Run: NODE_OPTIONS=--conditions=react-server tsx tests/investigation/mock-investigation.test.mts
import assert from "node:assert/strict";
import {
  startInvestigation,
  acceptFinding,
  rejectFinding,
  type InvestigationDeps,
  type InvestigationAssessmentRow,
} from "../../src/lib/investigation/orchestrator";
import type { Requirement } from "../../src/lib/investigation/types";
import type { ReflectOutput } from "../../src/lib/investigation/types";
import type { Retrieval } from "../../src/lib/rag/types";

process.env.OPENROUTER_API_KEY = "sk-or-test";

let pass = 0;
const ok = (c: boolean, m: string) => {
  assert.ok(c, m);
  console.log("ok  ", m);
  pass++;
};

const REQ: Requirement = { id: "req-1", text: "Lead cross-functional teams" };

const withEvidence: Retrieval = {
  found: true,
  context: "[file · resume.pdf] Led three teams through a platform migration.",
  sources: [{ source: "file", id: "resume.pdf", title: "resume.pdf" }],
  hits: [],
};
const noEvidence: Retrieval = {
  found: false,
  context: "NO_MATCHING_EVIDENCE_DATA",
  sources: [],
  hits: [],
};

const substantiatedOut: ReflectOutput = {
  sufficient: true,
  nextQuery: null,
  verdict: "met",
  rationale: "The resume shows leadership of three teams.",
  citations: [{ source: "file", id: "resume.pdf" }],
  confidence: "high",
};
const insufficientOut: ReflectOutput = {
  sufficient: false,
  nextQuery: "cross-team coordination",
  verdict: "gap",
  rationale: "Nothing on leadership yet.",
  citations: [],
  confidence: "low",
};
// Not "clearly sufficient", but it DOES cite real retrieved evidence as a partial match — exactly
// the case the Gap Check keeps as a development opportunity (F5).
const partialCitedOut: ReflectOutput = {
  sufficient: false,
  nextQuery: "cross-team coordination",
  verdict: "partial",
  rationale: "Shows leading teams, but not cross-functional scope.",
  citations: [{ source: "file", id: "resume.pdf" }],
  confidence: "medium",
};

type Counters = { retrievals: number; reflects: number; saves: number };

function makeDeps(
  over: Partial<InvestigationDeps> = {},
  evidence: Retrieval = withEvidence
): {
  deps: InvestigationDeps;
  counters: Counters;
  saved: InvestigationAssessmentRow[];
} {
  const counters: Counters = { retrievals: 0, reflects: 0, saves: 0 };
  const saved: InvestigationAssessmentRow[] = [];
  const deps: InvestigationDeps = {
    retrieveEvidence: async () => {
      counters.retrievals++;
      return evidence;
    },
    reflect: async () => {
      counters.reflects++;
      return substantiatedOut;
    },
    saveAssessment: async (row) => {
      counters.saves++;
      saved.push(row);
    },
    ...over,
  };
  return { deps, counters, saved };
}

// 1. startInvestigation substantiates on the first search and proposes a finding WITHOUT saving.
{
  const { deps, counters } = makeDeps();
  const r = await startInvestigation(deps, {
    requirement: REQ,
    searchBudget: 3,
  });
  ok(r.state.status === "awaiting_review", "start → awaiting_review");
  ok(
    r.finding !== null && r.finding.verdict === "met",
    "proposes a met finding"
  );
  ok(
    r.finding!.citations.length === 1,
    "finding carries the validated citation"
  );
  ok(counters.saves === 0, "nothing saved during the review pass (HITL)");
}

// 2. acceptFinding writes EXACTLY one assessment row, marked investigated, and completes.
{
  const { deps, counters, saved } = makeDeps();
  const r = await startInvestigation(deps, {
    requirement: REQ,
    searchBudget: 3,
  });
  const accepted = await acceptFinding(deps, {
    userId: "u1",
    requirement: REQ,
    targetRoleId: "role-1",
    finding: r.finding!,
  });
  ok(counters.saves === 1, "accept saves exactly one assessment");
  ok(accepted.state.status === "complete", "accept → complete");
  ok(saved[0].method === "investigated", "row is marked investigated");
  ok(saved[0].role_requirement_id === "req-1", "row keyed on the requirement");
  ok(
    saved[0].confidence === "high" && saved[0].search_count === 1,
    "provenance persisted"
  );
}

// 3. rejectFinding saves nothing and completes.
{
  const { deps, counters } = makeDeps();
  const r = await startInvestigation(deps, {
    requirement: REQ,
    searchBudget: 3,
  });
  const rejected = await rejectFinding({
    requirement: REQ,
    finding: r.finding!,
    searchBudget: 3,
  });
  ok(rejected.state.status === "complete", "reject → complete");
  ok(counters.saves === 0, "reject saves nothing");
}

// 4. Idempotent save: two accepts upsert the same row (no duplicate key beyond role_requirement_id).
{
  const { deps, counters, saved } = makeDeps();
  const r = await startInvestigation(deps, {
    requirement: REQ,
    searchBudget: 3,
  });
  await acceptFinding(deps, {
    userId: "u1",
    requirement: REQ,
    targetRoleId: "role-1",
    finding: r.finding!,
  });
  await acceptFinding(deps, {
    userId: "u1",
    requirement: REQ,
    targetRoleId: "role-1",
    finding: r.finding!,
  });
  ok(counters.saves === 2, "each accept issues one upsert");
  ok(
    saved.every((row) => row.role_requirement_id === "req-1"),
    "both upserts target the same role_requirement_id (upsert dedups in the DB)"
  );
}

// 5. Reformulation: insufficient first, substantiated second — uses the reflected next query.
{
  let call = 0;
  const { deps, counters } = makeDeps({
    reflect: async (input) => {
      call++;
      if (call === 1) return insufficientOut;
      // On the second call the previous query must have been carried forward.
      assert.ok(
        input.previousQueries.includes(REQ.text),
        "second reflect sees the first query as prior"
      );
      return substantiatedOut;
    },
  });
  const r = await startInvestigation(deps, {
    requirement: REQ,
    searchBudget: 3,
  });
  ok(counters.retrievals === 2, "a second search ran after insufficient");
  ok(call === 2, "reflect ran twice");
  ok(
    r.state.status === "awaiting_review" && r.finding!.verdict === "met",
    "ends substantiated"
  );
}

// 6. Budget exhausted: every reflect insufficient → a gap finding proposed, still needs accept.
{
  const { deps, counters } = makeDeps({ reflect: async () => insufficientOut });
  const r = await startInvestigation(deps, {
    requirement: REQ,
    searchBudget: 2,
  });
  ok(counters.retrievals === 2, "runs exactly the search budget");
  ok(
    r.state.status === "awaiting_review",
    "exhausted still routes through review"
  );
  ok(
    r.finding!.verdict === "gap" && r.finding!.citations.length === 0,
    "proposes a confirmed-gap finding"
  );
  ok(counters.saves === 0, "exhaustion saves nothing without accept");
}

// 7. Grounding guard: a model that claims sufficiency but cites non-retrieved evidence is not substantiated.
{
  const invented: ReflectOutput = {
    sufficient: true,
    nextQuery: null,
    verdict: "met",
    rationale: "Claims coverage with a citation that was never retrieved.",
    citations: [{ source: "file", id: "ghost.pdf" }],
    confidence: "high",
  };
  const { deps } = makeDeps({ reflect: async () => invented });
  const r = await startInvestigation(deps, {
    requirement: REQ,
    searchBudget: 1,
  });
  // ghost.pdf is not in withEvidence.sources → citation dropped → downgraded → gap (exhausted).
  ok(
    r.state.status === "awaiting_review" && r.finding!.verdict === "gap",
    "invented citation is stripped and the verdict downgraded to gap"
  );
  ok(r.finding!.citations.length === 0, "no invented citation survives");
}

// 8. Circuit breaker: a reflect that keeps throwing pauses instead of looping forever.
{
  const { deps, counters } = makeDeps({
    reflect: async () => {
      throw new Error("model down");
    },
  });
  const r = await startInvestigation(deps, {
    requirement: REQ,
    searchBudget: 5,
  });
  ok(r.state.status === "paused", "repeated reflect failure → paused");
  ok(counters.saves === 0, "breaker never saves");
}

// 9. No evidence retrieved: the grounding guard still prevents a false substantiation.
{
  const { deps, counters } = makeDeps({}, noEvidence);
  const r = await startInvestigation(deps, {
    requirement: REQ,
    searchBudget: 1,
  });
  // Even if reflect returns the "substantiated" fixture, there are no sources to validate against.
  ok(
    r.state.status === "awaiting_review" && r.finding!.verdict === "gap",
    "no retrieved sources → no valid citation → gap"
  );
  ok(counters.saves === 0, "still nothing saved");
}

// 10. F5: budget exhausted with a cited partial each pass → surface that partial finding (with its
//     citation), NOT a blanket "no evidence" that would contradict the Gap Check.
{
  const { deps, counters } = makeDeps({
    reflect: async () => partialCitedOut,
  });
  const r = await startInvestigation(deps, {
    requirement: REQ,
    searchBudget: 2,
  });
  ok(
    counters.retrievals === 2,
    "runs the full budget looking for better evidence"
  );
  ok(
    r.state.status === "awaiting_review",
    "exhausted-with-partial routes through review"
  );
  ok(
    r.finding!.verdict === "partial",
    "surfaces the partial verdict instead of a confirmed gap"
  );
  ok(
    r.finding!.citations.length === 1 &&
      r.finding!.citations[0].id === "resume.pdf",
    "keeps the cited evidence the Gap Check also shows (no contradiction)"
  );
  ok(
    r.finding!.rationale !== undefined &&
      !r.finding!.rationale.startsWith("No substantiating evidence"),
    "does not claim no evidence was found"
  );
  ok(counters.saves === 0, "still nothing saved without accept");
}

console.log(`\n${pass} checks passed`);
