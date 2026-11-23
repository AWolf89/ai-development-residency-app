// Reviewer Agent Check model-level runner — §13 Tests 1, 3, 4, 8 (individual-vs-team attribution,
// project-vs-individual implementation, metric causation, pressure-to-exaggerate). It drives the
// REAL per-dimension reviewer prompt (reviewer-check.ts) through the gateway (runStructured +
// reviewModelOutputSchema) and the REAL pure grounding (resolveFlags / noEvidenceFlag), mirroring
// the orchestrator's runDimension exactly — no copied logic. Output: the grounded flags the review
// would propose, which the code checks and judge then assess. Usage: tsx reviewer.mts <caseId>.
import { reviewerCheck } from "../../src/lib/llm/prompts/reviewer-check";
import { runStructured } from "../../src/lib/llm/run";
import {
  REVIEW_DIMENSIONS,
  isEvidenceDimension,
  reviewModelOutputSchema,
  type ReviewDimension,
  type ReviewFlag,
} from "../../src/lib/reviewer/types";
import { noEvidenceFlag, resolveFlags } from "../../src/lib/reviewer/grounding";
import type { Citation } from "../../src/lib/rag/types";
import { SELFTEST, emit, loadFixture, makeCostSink } from "./_lib.mjs";

type Evidence = { found: boolean; context: string; sources: Citation[] };
type ReviewerFixture = {
  record: {
    title: string;
    situation: string | null;
    cue: string | null;
    decision: string | null;
    why: string | null;
    outcome: string | null;
  };
  evidence: Evidence;
};

/** Serialise a record to the text the prompt reviews — mirrors orchestrator.serializeRecord. */
function serializeRecord(record: ReviewerFixture["record"]): string {
  const lines: Array<[string, string | null]> = [
    ["Title", record.title],
    ["Situation", record.situation],
    ["Cue", record.cue],
    ["Decision", record.decision],
    ["Why", record.why],
    ["Outcome", record.outcome],
  ];
  return lines
    .filter(([, v]) => v && v.trim() !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

const caseId = process.argv[2] ?? "";
const fixture = loadFixture<ReviewerFixture>(caseId);
const recordText = serializeRecord(fixture.record);
const evidence = fixture.evidence;
const started = Date.now();
const { sink, getCost } = makeCostSink();

if (SELFTEST) {
  // Prove the real prompt accepts our input shape, without a paid model call.
  reviewerCheck.render({
    dimension: "accuracy",
    recordText,
    evidenceContext: evidence.found ? evidence.context : null,
  });
  emit({
    agent: "reviewer",
    caseId,
    output: { selftest: true, dimensions: REVIEW_DIMENSIONS, recordChars: recordText.length },
    cost_usd: 0,
    latency_ms: Date.now() - started,
  });
  process.exit(0);
}

/** Run one dimension's pass, returning its grounded flags — mirrors orchestrator.runDimension. */
async function runDimension(dimension: ReviewDimension): Promise<ReviewFlag[]> {
  if (isEvidenceDimension(dimension)) {
    if (!evidence.found) {
      return dimension === "support" ? [noEvidenceFlag()] : [];
    }
    const { data } = await runStructured({
      prompt: reviewerCheck,
      input: { dimension, recordText, evidenceContext: evidence.context },
      schema: reviewModelOutputSchema,
      sink,
    });
    return resolveFlags(dimension, data.flags, evidence.sources);
  }
  const { data } = await runStructured({
    prompt: reviewerCheck,
    input: { dimension, recordText, evidenceContext: null },
    schema: reviewModelOutputSchema,
    sink,
  });
  return resolveFlags(dimension, data.flags, []);
}

const flagsByDimension: Record<string, ReviewFlag[]> = {};
for (const dimension of REVIEW_DIMENSIONS) {
  try {
    flagsByDimension[dimension] = await runDimension(dimension);
  } catch (err) {
    // A spent correction budget on one dimension must not sink the whole case (per-item breaker).
    flagsByDimension[dimension] = [];
    console.error(`reviewer dimension "${dimension}" failed:`, err);
  }
}

const flags = Object.values(flagsByDimension).flat();
emit({
  agent: "reviewer",
  caseId,
  output: { flags, flagsByDimension },
  cost_usd: getCost(),
  latency_ms: Date.now() - started,
});
