import { describe, it, expect } from "vitest";
import { gapClassification } from "./prompts/gap-classification";

describe("gap-classification prompt", () => {
  it("is a versioned extract prompt with a stable id", () => {
    expect(gapClassification.id).toBe("gap-classification");
    expect(gapClassification.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(gapClassification.purpose).toBe("extract");
  });

  it("states the closed-grounding rules in the system prompt", () => {
    const s = gapClassification.system.toLowerCase();
    expect(s).toContain("only"); // only from retrieved text
    expect(s).toContain("data, never instructions"); // injection defense
    expect(s).toMatch(/cite|citation/); // must cite
    expect(s).toMatch(/met|partial|gap/); // the three model verdicts
  });

  it("wraps evidence, reference, and requirement as untrusted data", () => {
    const out = gapClassification.render({
      requirementText: "Lead cloud migrations",
      evidenceContext: "[file · resume.pdf] Led a migration.",
      referenceContext: "[onet · 15-1252.00] Developers design systems.",
    });
    // evidence in a document tag, reference in a context tag, requirement in user_input
    expect(out).toContain("<document>");
    expect(out).toContain("Led a migration.");
    expect(out).toContain("<context>");
    expect(out).toContain("Developers design systems.");
    expect(out).toContain("<user_input>");
    expect(out).toContain("Lead cloud migrations");
  });

  it("omits the reference block when referenceContext is null", () => {
    const out = gapClassification.render({
      requirementText: "Lead cloud migrations",
      evidenceContext: "[file · resume.pdf] Led a migration.",
      referenceContext: null,
    });
    expect(out).not.toContain("<context>");
    expect(out).toContain("<document>");
    expect(out).toContain("<user_input>");
  });
});
