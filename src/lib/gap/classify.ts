/**
 * Pure Gap Classification decision logic (ADR-0011). No IO and no `server-only` import, so it
 * is unit-tested with injected fakes (Dependency Inversion). The thin boundary that wires the
 * real retriever + model gateway lives in classifier.ts (Humble Object, CLAUDE.md §3).
 *
 * The closed-RAG safety properties live here, not in the prompt:
 *  - no evidence retrieved  → `unknown`, with NO model call (can't hallucinate coverage);
 *  - every model citation is validated against what was actually retrieved;
 *  - a met/partial verdict left with no valid citation is downgraded to `gap`.
 */
import type { Citation, Retrieval } from "@/lib/rag/types";
import type {
  AssessmentRow,
  GapModelOutput,
  GapVerdict,
  ModelCitation,
  ModelVerdict,
  RequirementGap,
} from "./types";

/** Rationale used when a requirement has no retrieved evidence to judge. */
export const NO_EVIDENCE_RATIONALE =
  "No matching evidence was found for this requirement.";

/** One requirement to classify. */
export type RequirementInput = { id: string; text: string };

/** What the model boundary returns for one classification call. */
export type GapModelResult = {
  output: GapModelOutput;
  attempts: number;
  truncated: boolean;
};

/** The model call, as a plain injected function (keeps this module SDK-free). */
export type GapModelFn = (args: {
  requirementText: string;
  evidenceContext: string;
  referenceContext: string | null;
}) => Promise<GapModelResult>;

/** The retrieval + model capabilities this logic depends on (all injectable for tests). */
export type ClassifyDeps = {
  retrieveEvidence: (question: string) => Promise<Retrieval>;
  retrieveReference: (question: string) => Promise<Retrieval>;
  runModel: GapModelFn;
};

/** Keep only citations that point at a really-retrieved source; dedup by source+id. */
export function validateCitations(
  returned: ModelCitation[],
  retrievedSources: Citation[]
): Citation[] {
  const bySourceId = new Map(
    retrievedSources.map((s) => [`${s.source}:${s.id}`, s])
  );
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const c of returned) {
    const key = `${c.source}:${c.id}`;
    const match = bySourceId.get(key);
    if (match && !seen.has(key)) {
      out.push(match);
      seen.add(key);
    }
  }
  return out;
}

/** A met/partial verdict with no substantiating citation is downgraded to gap. */
export function resolveVerdict(
  modelVerdict: ModelVerdict,
  validCitations: Citation[]
): GapVerdict {
  if (
    (modelVerdict === "met" || modelVerdict === "partial") &&
    validCitations.length === 0
  ) {
    return "gap";
  }
  return modelVerdict;
}

/** Classify one requirement against the user's evidence (grounded, honest about gaps). */
export async function classifyRequirement(
  req: RequirementInput,
  deps: ClassifyDeps
): Promise<RequirementGap> {
  const evidence = await deps.retrieveEvidence(req.text);

  // Critical path 1: no evidence → unknown, no model call, no citations.
  if (!evidence.found) {
    return {
      requirementId: req.id,
      requirementText: req.text,
      verdict: "unknown",
      rationale: NO_EVIDENCE_RATIONALE,
      citations: [],
      evidenceFound: false,
      referenceUsed: false,
      modelAttempts: 0,
      truncated: false,
    };
  }

  const reference = await deps.retrieveReference(req.text);
  const referenceContext = reference.found ? reference.context : null;

  const { output, attempts, truncated } = await deps.runModel({
    requirementText: req.text,
    evidenceContext: evidence.context,
    referenceContext,
  });

  // Critical path 2: citations must point at really-retrieved sources (evidence + reference).
  const retrievedSources = reference.found
    ? [...evidence.sources, ...reference.sources]
    : evidence.sources;
  const citations = validateCitations(output.citations, retrievedSources);
  const verdict = resolveVerdict(output.verdict, citations);

  return {
    requirementId: req.id,
    requirementText: req.text,
    verdict,
    rationale: output.rationale,
    citations,
    evidenceFound: true,
    referenceUsed: reference.found,
    modelAttempts: attempts,
    truncated,
  };
}

/** Classify every requirement in order (bounded, sequential — not an agent loop). */
export async function classifyRequirements(
  reqs: RequirementInput[],
  deps: ClassifyDeps
): Promise<RequirementGap[]> {
  const results: RequirementGap[] = [];
  for (const req of reqs) {
    results.push(await classifyRequirement(req, deps));
  }
  return results;
}

/** Map a classification result + context to a `requirement_gap_assessments` row. */
export function toAssessmentRow(
  gap: RequirementGap,
  ctx: {
    userId: string;
    targetRoleId: string;
    modelUsed: string;
    promptVersion: string;
  }
): AssessmentRow {
  return {
    user_id: ctx.userId,
    role_requirement_id: gap.requirementId,
    target_role_id: ctx.targetRoleId,
    verdict: gap.verdict,
    rationale: gap.rationale,
    citations: gap.citations,
    evidence_found: gap.evidenceFound,
    model_used: ctx.modelUsed,
    prompt_version: ctx.promptVersion,
  };
}
