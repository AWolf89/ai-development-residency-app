/**
 * Pure composition for one File Analysis pass (ADR-0020). No IO and no `server-only` import, so
 * it is unit-tested with injected fakes (Dependency Inversion). The thin boundary that wires the
 * real retriever, reference_items lookup, and model gateway lives in classifier.ts (Humble
 * Object, CLAUDE.md §3).
 *
 * The grounding guarantees live here, not in the prompt:
 *  - no candidate items retrieved → empty, honest result with NO model call (can't tag what is
 *    not in the vocabulary, and can't hallucinate coverage);
 *  - every model tag is validated against the really-retrieved candidate set (analyze.ts).
 */
import type { Retrieval } from "@/lib/rag/types";
import {
  candidateKeysFromHits,
  rowMatchesAnyKey,
  toCandidate,
  type CandidateKey,
  type ReferenceItemRow,
} from "./candidates";
import { validateTags } from "./analyze";
import type {
  AnalysisOutput,
  Candidate,
  ClarifyingQuestion,
  ProposedTag,
} from "./types";

/** One model call for an analysis pass, as a plain injected function (keeps this module SDK-free). */
export type AnalysisModelFn = (args: {
  fileText: string;
  candidates: Candidate[];
  priorAnswers?: { question: string; answer: string }[];
}) => Promise<{ output: AnalysisOutput; attempts: number; truncated: boolean }>;

/** The capabilities an analysis pass depends on (all injectable for tests). */
export type AnalysisDeps = {
  retrieveReference: (question: string) => Promise<Retrieval>;
  lookupReferenceItems: (keys: CandidateKey[]) => Promise<ReferenceItemRow[]>;
  runModel: AnalysisModelFn;
};

/** The result of one analysis pass: a summary + validated tags + any clarification questions. */
export type AnalysisPassResult = {
  summary: string;
  tags: ProposedTag[];
  questions: ClarifyingQuestion[];
  candidateCount: number;
  modelAttempts: number;
  truncated: boolean;
};

/** Rationale used when no framework/O*NET candidates match the file at all (no model call). */
export const NO_CANDIDATES_SUMMARY =
  "No matching Skills & Practices or O*NET items were found for this file.";

/**
 * Find the taggable reference_items relevant to the file (the closed-world candidate set):
 * retrieve relevant reference passages, parse their chunk ids back to keys, and fetch the rows.
 */
export async function retrieveCandidates(
  fileText: string,
  deps: AnalysisDeps
): Promise<Candidate[]> {
  const retrieval = await deps.retrieveReference(fileText);
  const keys = candidateKeysFromHits(retrieval.hits);
  if (keys.length === 0) return [];
  const rows = await deps.lookupReferenceItems(keys);
  return rows.filter((row) => rowMatchesAnyKey(row, keys)).map(toCandidate);
}

/**
 * Run one grounded analysis pass over a file's text. With no candidates we short-circuit to an
 * empty, honest result with no model call. Otherwise the model proposes tags + questions, and
 * every tag is validated against the real candidate set so an invented id is dropped.
 */
export async function runAnalysisPass(
  fileText: string,
  priorAnswers: { question: string; answer: string }[] | undefined,
  deps: AnalysisDeps
): Promise<AnalysisPassResult> {
  const candidates = await retrieveCandidates(fileText, deps);
  if (candidates.length === 0) {
    return {
      summary: NO_CANDIDATES_SUMMARY,
      tags: [],
      questions: [],
      candidateCount: 0,
      modelAttempts: 0,
      truncated: false,
    };
  }

  const { output, attempts, truncated } = await deps.runModel({
    fileText,
    candidates,
    priorAnswers,
  });

  return {
    summary: output.summary,
    tags: validateTags(output.tags, candidates),
    questions: output.questions.map((text) => ({ text })),
    candidateCount: candidates.length,
    modelAttempts: attempts,
    truncated,
  };
}
