import { describe, it, expect } from "vitest";
import type { Candidate, ModelTag } from "./types";
import {
  validateTags,
  highConfidenceOnly,
  needsReview,
  buildEnrichmentText,
  buildIndexedText,
  toTagRow,
} from "./analyze";

const SKILL: Candidate = {
  id: "11111111-1111-4111-8111-111111111111",
  source: "techfleet-spf",
  entityType: "skills",
  externalId: "customer-journey-mapping",
  name: "Customer Journey Mapping",
  description: "Mapping a customer's experience across touchpoints.",
};
const DELIVERABLE: Candidate = {
  id: "22222222-2222-4222-8222-222222222222",
  source: "techfleet-spf",
  entityType: "deliverables",
  externalId: "journey-map",
  name: "Journey Map",
  description: null,
};

describe("validateTags (closed-world grounding)", () => {
  it("keeps only tags whose id is a real candidate, enriched with the candidate's identity", () => {
    const returned: ModelTag[] = [
      {
        referenceItemId: SKILL.id,
        confidence: "high",
        rationale: "It is a journey map.",
      },
    ];
    const out = validateTags(returned, [SKILL, DELIVERABLE]);
    expect(out).toEqual([
      {
        referenceItemId: SKILL.id,
        source: "techfleet-spf",
        entityType: "skills",
        externalId: "customer-journey-mapping",
        name: "Customer Journey Mapping",
        confidence: "high",
        rationale: "It is a journey map.",
      },
    ]);
  });

  it("drops a tag that points at an id that was never a candidate (no invented tags)", () => {
    const returned: ModelTag[] = [
      {
        referenceItemId: "99999999-9999-4999-8999-999999999999",
        confidence: "high",
        rationale: "made up",
      },
    ];
    expect(validateTags(returned, [SKILL, DELIVERABLE])).toEqual([]);
  });

  it("dedups repeated ids, keeping the first", () => {
    const returned: ModelTag[] = [
      { referenceItemId: SKILL.id, confidence: "high", rationale: "first" },
      { referenceItemId: SKILL.id, confidence: "low", rationale: "second" },
    ];
    const out = validateTags(returned, [SKILL]);
    expect(out).toHaveLength(1);
    expect(out[0].rationale).toBe("first");
  });

  it("returns empty when nothing matches", () => {
    expect(validateTags([], [SKILL])).toEqual([]);
  });
});

describe("highConfidenceOnly", () => {
  it("keeps only high-confidence tags (batch auto-apply set)", () => {
    const tags = validateTags(
      [
        { referenceItemId: SKILL.id, confidence: "high", rationale: "a" },
        {
          referenceItemId: DELIVERABLE.id,
          confidence: "medium",
          rationale: "b",
        },
      ],
      [SKILL, DELIVERABLE]
    );
    const out = highConfidenceOnly(tags);
    expect(out.map((t) => t.referenceItemId)).toEqual([SKILL.id]);
  });
});

describe("needsReview (batch gate)", () => {
  const high = validateTags(
    [{ referenceItemId: SKILL.id, confidence: "high", rationale: "a" }],
    [SKILL]
  );
  const mixed = validateTags(
    [
      { referenceItemId: SKILL.id, confidence: "high", rationale: "a" },
      { referenceItemId: DELIVERABLE.id, confidence: "low", rationale: "b" },
    ],
    [SKILL, DELIVERABLE]
  );

  it("is true whenever the model asked questions", () => {
    expect(needsReview(high, 1)).toBe(true);
  });

  it("is true when any tag is not high-confidence", () => {
    expect(needsReview(mixed, 0)).toBe(true);
  });

  it("is false for all-high-confidence tags and no questions", () => {
    expect(needsReview(high, 0)).toBe(false);
  });

  it("is false for no tags and no questions (nothing to apply)", () => {
    expect(needsReview([], 0)).toBe(false);
  });
});

describe("buildEnrichmentText", () => {
  const tags = validateTags(
    [
      { referenceItemId: SKILL.id, confidence: "high", rationale: "a" },
      { referenceItemId: DELIVERABLE.id, confidence: "medium", rationale: "b" },
    ],
    [SKILL, DELIVERABLE]
  );

  it("combines the summary with the tagged competency names and kinds", () => {
    const text = buildEnrichmentText("A journey map for OUAT.", tags);
    expect(text).toContain("A journey map for OUAT.");
    expect(text).toContain("Customer Journey Mapping (skills)");
    expect(text).toContain("Journey Map (deliverables)");
  });

  it("uses the summary alone when there are no tags", () => {
    expect(buildEnrichmentText("Just a summary.", [])).toBe("Just a summary.");
  });

  it("returns an empty string when there is nothing to index", () => {
    expect(buildEnrichmentText("   ", [])).toBe("");
  });
});

describe("buildIndexedText", () => {
  const tags = validateTags(
    [{ referenceItemId: SKILL.id, confidence: "high", rationale: "a" }],
    [SKILL]
  );

  it("combines the file text with the enrichment passage", () => {
    const text = buildIndexedText("Raw document text.", "A summary.", tags);
    expect(text).toContain("Raw document text.");
    expect(text).toContain("A summary.");
    expect(text).toContain("Customer Journey Mapping (skills)");
  });

  it("uses the file text alone when there is no summary or tags", () => {
    expect(buildIndexedText("Raw text.", "", [])).toBe("Raw text.");
  });

  it("uses the enrichment alone when there is no file text (e.g. a thin image)", () => {
    expect(buildIndexedText("", "A summary.", [])).toBe("A summary.");
  });

  it("returns an empty string when there is nothing to index", () => {
    expect(buildIndexedText("  ", "", [])).toBe("");
  });
});

describe("toTagRow", () => {
  it("maps a proposed tag to a file_reference_tags row", () => {
    const [tag] = validateTags(
      [
        {
          referenceItemId: SKILL.id,
          confidence: "high",
          rationale: "a journey map",
        },
      ],
      [SKILL]
    );
    expect(toTagRow(tag, { userId: "user-1", fileId: "file-1" })).toEqual({
      user_id: "user-1",
      file_id: "file-1",
      reference_item_id: SKILL.id,
      entity_type: "skills",
      confidence: "high",
      rationale: "a journey map",
    });
  });
});
