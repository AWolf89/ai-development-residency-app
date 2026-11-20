import { describe, it, expect, vi } from "vitest";
import {
  classifyRequirement,
  classifyRequirements,
  validateCitations,
  resolveVerdict,
  toAssessmentRow,
  NO_EVIDENCE_RATIONALE,
  CLASSIFY_FAILED_RATIONALE,
  type ClassifyDeps,
} from "./classify";
import type { GapModelOutput } from "./types";
import type { Citation, Retrieval } from "@/lib/rag/types";

// ---- fixtures ---------------------------------------------------------------

const evidenceCitation: Citation = {
  source: "file",
  id: "resume.pdf",
  title: "resume.pdf",
};

function retrieval(over: Partial<Retrieval> = {}): Retrieval {
  return {
    found: true,
    context: "[file · resume.pdf] Led a cloud migration for 12 services.",
    sources: [evidenceCitation],
    hits: [],
    ...over,
  };
}

const NOT_FOUND: Retrieval = {
  found: false,
  context: "NO_MATCHING_EVIDENCE_DATA",
  sources: [],
  hits: [],
};

function modelOutput(over: Partial<GapModelOutput> = {}): GapModelOutput {
  return {
    verdict: "met",
    rationale: "Resume shows leading a migration.",
    citations: [{ source: "file", id: "resume.pdf" }],
    ...over,
  };
}

function makeDeps(
  over: Partial<ClassifyDeps> & { output?: GapModelOutput } = {}
): { deps: ClassifyDeps; runModel: ReturnType<typeof vi.fn> } {
  const runModel = vi.fn(async () => ({
    output: over.output ?? modelOutput(),
    attempts: 1,
    truncated: false,
  }));
  const deps: ClassifyDeps = {
    retrieveEvidence: over.retrieveEvidence ?? (async () => retrieval()),
    retrieveReference: over.retrieveReference ?? (async () => NOT_FOUND),
    runModel: over.runModel ?? runModel,
  };
  return { deps, runModel };
}

const req = { id: "req-1", text: "Experience leading cloud migrations" };

// ---- critical path 1: no-evidence short-circuit -----------------------------

describe("classifyRequirement — no-evidence short-circuit", () => {
  it("returns unknown and never calls the model when no evidence is found", async () => {
    const { deps, runModel } = makeDeps({
      retrieveEvidence: async () => NOT_FOUND,
    });
    const gap = await classifyRequirement(req, deps);

    expect(runModel).not.toHaveBeenCalled();
    expect(gap.verdict).toBe("unknown");
    expect(gap.evidenceFound).toBe(false);
    expect(gap.citations).toEqual([]);
    expect(gap.rationale).toBe(NO_EVIDENCE_RATIONALE);
    expect(gap.modelAttempts).toBe(0);
  });

  it("does not even retrieve reference when there is no evidence", async () => {
    const retrieveReference = vi.fn(async () => retrieval());
    const { deps } = makeDeps({
      retrieveEvidence: async () => NOT_FOUND,
      retrieveReference,
    });
    await classifyRequirement(req, deps);
    expect(retrieveReference).not.toHaveBeenCalled();
  });
});

// ---- critical path 2: no invented coverage ----------------------------------

describe("classifyRequirement — grounding & citation guard", () => {
  it("keeps a met verdict backed by a retrieved citation", async () => {
    const { deps } = makeDeps();
    const gap = await classifyRequirement(req, deps);
    expect(gap.verdict).toBe("met");
    expect(gap.citations).toEqual([evidenceCitation]);
    expect(gap.evidenceFound).toBe(true);
  });

  it("drops a citation the model invented (not in retrieved sources)", async () => {
    const { deps } = makeDeps({
      output: modelOutput({
        citations: [
          { source: "file", id: "resume.pdf" },
          { source: "onet", id: "99-9999.00" }, // never retrieved
        ],
      }),
    });
    const gap = await classifyRequirement(req, deps);
    expect(gap.citations).toEqual([evidenceCitation]);
  });

  it("downgrades a met verdict with only invented citations to gap", async () => {
    const { deps } = makeDeps({
      output: modelOutput({
        verdict: "met",
        citations: [{ source: "onet", id: "99-9999.00" }],
      }),
    });
    const gap = await classifyRequirement(req, deps);
    expect(gap.verdict).toBe("gap");
    expect(gap.citations).toEqual([]);
  });

  it("downgrades a partial verdict with zero citations to gap", async () => {
    const { deps } = makeDeps({
      output: modelOutput({ verdict: "partial", citations: [] }),
    });
    const gap = await classifyRequirement(req, deps);
    expect(gap.verdict).toBe("gap");
  });

  it("keeps a gap verdict as-is (no citation required)", async () => {
    const { deps } = makeDeps({
      output: modelOutput({ verdict: "gap", citations: [] }),
    });
    const gap = await classifyRequirement(req, deps);
    expect(gap.verdict).toBe("gap");
  });
});

// ---- reference handling & propagation ---------------------------------------

describe("classifyRequirement — reference & metadata", () => {
  it("retrieves reference context and marks referenceUsed when found", async () => {
    const refRetrieval = retrieval({
      context: "[onet · 15-1252.00] Software developers design systems.",
      sources: [
        { source: "onet", id: "15-1252.00", title: "Software Developers" },
      ],
    });
    const runModel = vi.fn(async () => ({
      output: modelOutput(),
      attempts: 2,
      truncated: true,
    }));
    const { deps } = makeDeps({
      retrieveReference: async () => refRetrieval,
      runModel,
    });
    const gap = await classifyRequirement(req, deps);

    expect(gap.referenceUsed).toBe(true);
    expect(runModel).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementText: req.text,
        evidenceContext: retrieval().context,
        referenceContext: refRetrieval.context,
      })
    );
    expect(gap.modelAttempts).toBe(2);
    expect(gap.truncated).toBe(true);
  });

  it("validates a met citation against reference sources too", async () => {
    const refCite: Citation = {
      source: "onet",
      id: "15-1252.00",
      title: "Software Developers",
    };
    const { deps } = makeDeps({
      retrieveReference: async () =>
        retrieval({ context: "ref", sources: [refCite] }),
      output: modelOutput({
        verdict: "partial",
        citations: [{ source: "onet", id: "15-1252.00" }],
      }),
    });
    const gap = await classifyRequirement(req, deps);
    expect(gap.verdict).toBe("partial");
    expect(gap.citations).toEqual([refCite]);
  });

  it("passes referenceContext null when reference is not found", async () => {
    const runModel = vi.fn(async () => ({
      output: modelOutput(),
      attempts: 1,
      truncated: false,
    }));
    const { deps } = makeDeps({ runModel });
    await classifyRequirement(req, deps);
    expect(runModel).toHaveBeenCalledWith(
      expect.objectContaining({ referenceContext: null })
    );
  });
});

// ---- batch ------------------------------------------------------------------

describe("classifyRequirements — batch", () => {
  it("classifies each requirement, preserving order and per-item short-circuit", async () => {
    const reqs = [
      { id: "a", text: "has evidence" },
      { id: "b", text: "no evidence" },
    ];
    const deps: ClassifyDeps = {
      retrieveEvidence: async (q) =>
        q === "no evidence" ? NOT_FOUND : retrieval(),
      retrieveReference: async () => NOT_FOUND,
      runModel: async () => ({
        output: modelOutput(),
        attempts: 1,
        truncated: false,
      }),
    };
    const gaps = await classifyRequirements(reqs, deps);
    expect(gaps.map((g) => g.requirementId)).toEqual(["a", "b"]);
    expect(gaps[0].verdict).toBe("met");
    expect(gaps[1].verdict).toBe("unknown");
  });

  it("returns an empty array for no requirements", async () => {
    const { deps } = makeDeps();
    expect(await classifyRequirements([], deps)).toEqual([]);
  });

  it("degrades a requirement whose model call throws to unknown, without failing the batch", async () => {
    const reqs = [
      { id: "a", text: "first — model throws" },
      { id: "b", text: "second — succeeds" },
    ];
    let call = 0;
    const deps: ClassifyDeps = {
      retrieveEvidence: async () => retrieval(),
      retrieveReference: async () => NOT_FOUND,
      runModel: async () => {
        call += 1;
        if (call === 1) throw new Error("structured output failed validation");
        return { output: modelOutput(), attempts: 1, truncated: false };
      },
    };
    const gaps = await classifyRequirements(reqs, deps);

    expect(gaps.map((g) => g.requirementId)).toEqual(["a", "b"]);
    expect(gaps[0].verdict).toBe("unknown");
    expect(gaps[0].rationale).toBe(CLASSIFY_FAILED_RATIONALE);
    expect(gaps[0].citations).toEqual([]);
    expect(gaps[1].verdict).toBe("met"); // the rest of the run still completes
  });
});

// ---- pure helpers -----------------------------------------------------------

describe("validateCitations", () => {
  const sources: Citation[] = [
    { source: "file", id: "a.pdf", title: "A" },
    { source: "onet", id: "15-1252.00", title: "Dev" },
  ];

  it("keeps matches, drops non-matches, and dedups", () => {
    const out = validateCitations(
      [
        { source: "file", id: "a.pdf" },
        { source: "file", id: "a.pdf" }, // dup
        { source: "x", id: "y" }, // invented
      ],
      sources
    );
    expect(out).toEqual([{ source: "file", id: "a.pdf", title: "A" }]);
  });

  it("returns empty when nothing matches", () => {
    expect(validateCitations([{ source: "x", id: "y" }], sources)).toEqual([]);
  });
});

describe("resolveVerdict", () => {
  const cite: Citation[] = [{ source: "file", id: "a", title: "A" }];
  it("keeps met/partial when a citation exists", () => {
    expect(resolveVerdict("met", cite)).toBe("met");
    expect(resolveVerdict("partial", cite)).toBe("partial");
  });
  it("downgrades uncited met/partial to gap", () => {
    expect(resolveVerdict("met", [])).toBe("gap");
    expect(resolveVerdict("partial", [])).toBe("gap");
  });
  it("leaves gap unchanged regardless of citations", () => {
    expect(resolveVerdict("gap", [])).toBe("gap");
    expect(resolveVerdict("gap", cite)).toBe("gap");
  });
});

describe("toAssessmentRow", () => {
  it("maps a RequirementGap and context to the DB row shape", () => {
    const row = toAssessmentRow(
      {
        requirementId: "req-1",
        requirementText: "x",
        verdict: "met",
        rationale: "because",
        citations: [evidenceCitation],
        evidenceFound: true,
        referenceUsed: false,
        modelAttempts: 1,
        truncated: false,
      },
      {
        userId: "user-1",
        targetRoleId: "role-1",
        modelUsed: "anthropic/claude-haiku-5.5",
        promptVersion: "1.0.0",
      }
    );
    expect(row).toEqual({
      user_id: "user-1",
      role_requirement_id: "req-1",
      target_role_id: "role-1",
      verdict: "met",
      rationale: "because",
      citations: [evidenceCitation],
      evidence_found: true,
      model_used: "anthropic/claude-haiku-5.5",
      prompt_version: "1.0.0",
    });
  });
});
