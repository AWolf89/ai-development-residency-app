import { describe, it, expect, vi } from "vitest";
import type { Hit, Retrieval } from "@/lib/rag/types";
import type { ReferenceItemRow } from "./candidates";
import {
  retrieveCandidates,
  runAnalysisPass,
  NO_CANDIDATES_SUMMARY,
  type AnalysisDeps,
} from "./pass";
import type { AnalysisOutput } from "./types";

function hit(id: string, source: string): Hit {
  return {
    id,
    source,
    ref_id: id,
    title: "t",
    section: "entity",
    content: "c",
    keyword_rank: 1,
    semantic_rank: 1,
    similarity: 0.9,
    score: 1,
  };
}

function retrieval(hits: Hit[]): Retrieval {
  return { found: hits.length > 0, context: "ctx", sources: [], hits };
}

const SKILL_ROW: ReferenceItemRow = {
  id: "11111111-1111-4111-8111-111111111111",
  source: "techfleet-spf",
  entity_type: "skills",
  external_id: "customer-journey-mapping",
  name: "Customer Journey Mapping",
  description: "Mapping a customer's experience across touchpoints.",
};

/** Build deps with sensible fakes; override per test. */
function makeDeps(over: Partial<AnalysisDeps> = {}): AnalysisDeps {
  return {
    retrieveReference: async () =>
      retrieval([
        hit("techfleet-spf:skills:customer-journey-mapping", "techfleet-spf"),
      ]),
    lookupReferenceItems: async () => [SKILL_ROW],
    runModel: async () => ({
      output: { summary: "A journey map.", tags: [], questions: [] },
      attempts: 1,
      truncated: false,
    }),
    ...over,
  };
}

describe("retrieveCandidates", () => {
  it("parses reference hits into candidates and filters over-fetched rows", async () => {
    const OTHER_ROW: ReferenceItemRow = {
      ...SKILL_ROW,
      id: "33333333-3333-4333-8333-333333333333",
      entity_type: "deliverables", // same external_id, different entity_type → must be excluded
    };
    const deps = makeDeps({
      lookupReferenceItems: async () => [SKILL_ROW, OTHER_ROW],
    });
    const candidates = await retrieveCandidates("some text", deps);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe(SKILL_ROW.id);
    expect(candidates[0].entityType).toBe("skills");
  });

  it("returns [] and never looks up when nothing relevant is retrieved", async () => {
    const lookup = vi.fn(async () => [] as ReferenceItemRow[]);
    const deps = makeDeps({
      retrieveReference: async () => retrieval([]),
      lookupReferenceItems: lookup,
    });
    expect(await retrieveCandidates("x", deps)).toEqual([]);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("runAnalysisPass", () => {
  it("short-circuits to an honest empty result with NO model call when there are no candidates", async () => {
    const runModel = vi.fn();
    const deps = makeDeps({
      retrieveReference: async () => retrieval([]),
      runModel,
    });
    const result = await runAnalysisPass("x", undefined, deps);
    expect(result.summary).toBe(NO_CANDIDATES_SUMMARY);
    expect(result.tags).toEqual([]);
    expect(result.questions).toEqual([]);
    expect(result.modelAttempts).toBe(0);
    expect(runModel).not.toHaveBeenCalled();
  });

  it("validates model tags against candidates (drops invented ids) and maps questions", async () => {
    const output: AnalysisOutput = {
      summary: "A customer journey map for OUAT.",
      tags: [
        {
          referenceItemId: SKILL_ROW.id,
          confidence: "high",
          rationale: "it is a journey map",
        },
        {
          referenceItemId: "99999999-9999-4999-8999-999999999999",
          confidence: "high",
          rationale: "made up",
        },
      ],
      questions: ["Which project was this for?"],
    };
    const deps = makeDeps({
      runModel: async () => ({ output, attempts: 1, truncated: false }),
    });
    const result = await runAnalysisPass("text", undefined, deps);
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0].referenceItemId).toBe(SKILL_ROW.id);
    expect(result.tags[0].name).toBe("Customer Journey Mapping");
    expect(result.questions).toEqual([{ text: "Which project was this for?" }]);
    expect(result.candidateCount).toBe(1);
  });

  it("passes prior clarification answers through to the model", async () => {
    const runModel = vi.fn(async () => ({
      output: { summary: "s", tags: [], questions: [] } as AnalysisOutput,
      attempts: 1,
      truncated: false,
    }));
    const deps = makeDeps({ runModel });
    const answers = [{ question: "Which project?", answer: "OUAT" }];
    await runAnalysisPass("text", answers, deps);
    expect(runModel).toHaveBeenCalledWith(
      expect.objectContaining({ priorAnswers: answers })
    );
  });
});
