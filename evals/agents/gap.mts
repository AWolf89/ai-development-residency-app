// Gap Classification model-level runner — §13 Test 10 (evidence gap ≠ skill gap; no binary hiring
// verdict). It drives the REAL gap prompt (gap-classification.ts) through the gateway (runStructured
// + gapModelOutputSchema) and the REAL pure logic (validateCitations / resolveVerdict + the
// no-evidence short-circuit), mirroring classify.ts's classifyRequirement exactly — no copied logic.
// A requirement with no retrieved evidence short-circuits to `unknown` with NO model call (it can't
// hallucinate coverage); a met/partial verdict with no valid citation is downgraded to `gap`.
// Output: a per-requirement verdict list. Usage: tsx gap.mts <caseId>.
import { gapClassification } from "../../src/lib/llm/prompts/gap-classification";
import { runStructured } from "../../src/lib/llm/run";
import { gapModelOutputSchema } from "../../src/lib/gap/types";
import type { GapVerdict } from "../../src/lib/gap/types";
import {
  NO_EVIDENCE_RATIONALE,
  resolveVerdict,
  validateCitations,
} from "../../src/lib/gap/classify";
import type { Citation } from "../../src/lib/rag/types";
import { SELFTEST, emit, loadFixture, makeCostSink } from "./_lib.mjs";

type Retrieval = { found: boolean; context: string; sources: Citation[] };
type GapFixture = {
  requirements: {
    id: string;
    text: string;
    evidence: Retrieval;
    reference: Retrieval;
  }[];
};

const caseId = process.argv[2] ?? "";
const fixture = loadFixture<GapFixture>(caseId);
const started = Date.now();
const { sink, getCost } = makeCostSink();

if (SELFTEST) {
  const first = fixture.requirements[0];
  gapClassification.render({
    requirementText: first.text,
    evidenceContext: first.evidence.context,
    referenceContext: first.reference.found ? first.reference.context : null,
  });
  emit({
    agent: "gap",
    caseId,
    output: { selftest: true, requirementCount: fixture.requirements.length },
    cost_usd: 0,
    latency_ms: Date.now() - started,
  });
  process.exit(0);
}

type RequirementResult = {
  requirementId: string;
  requirementText: string;
  verdict: GapVerdict;
  rationale: string;
  citations: Citation[];
  evidenceFound: boolean;
  referenceUsed: boolean;
  modelAttempts: number;
};

const results: RequirementResult[] = [];
for (const req of fixture.requirements) {
  // No-evidence short-circuit (classify.ts): unknown, no model call, no citations.
  if (!req.evidence.found) {
    results.push({
      requirementId: req.id,
      requirementText: req.text,
      verdict: "unknown",
      rationale: NO_EVIDENCE_RATIONALE,
      citations: [],
      evidenceFound: false,
      referenceUsed: false,
      modelAttempts: 0,
    });
    continue;
  }

  const referenceContext = req.reference.found ? req.reference.context : null;
  const { data, attempts } = await runStructured({
    prompt: gapClassification,
    input: {
      requirementText: req.text,
      evidenceContext: req.evidence.context,
      referenceContext,
    },
    schema: gapModelOutputSchema,
    sink,
  });

  const retrievedSources = req.reference.found
    ? [...req.evidence.sources, ...req.reference.sources]
    : req.evidence.sources;
  const citations = validateCitations(data.citations, retrievedSources);
  const verdict = resolveVerdict(data.verdict, citations);

  results.push({
    requirementId: req.id,
    requirementText: req.text,
    verdict,
    rationale: data.rationale,
    citations,
    evidenceFound: true,
    referenceUsed: req.reference.found,
    modelAttempts: attempts,
  });
}

emit({
  agent: "gap",
  caseId,
  output: { results },
  cost_usd: getCost(),
  latency_ms: Date.now() - started,
});
