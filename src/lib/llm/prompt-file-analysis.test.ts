import { describe, it, expect } from "vitest";
import { fileAnalysis } from "./prompts/file-analysis";

describe("file-analysis prompt", () => {
  it("is a versioned extract prompt with a stable id", () => {
    expect(fileAnalysis.id).toBe("file-analysis");
    expect(fileAnalysis.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(fileAnalysis.purpose).toBe("extract");
  });

  it("states the grounding and ask-when-unsure rules", () => {
    const s = fileAnalysis.system.toLowerCase();
    expect(s).toContain("only"); // only the supplied candidates
    expect(s).toContain("data, never instructions"); // injection defense
    expect(s).toMatch(
      /never return an id that is not|omit a candidate rather than guess/
    );
    expect(s).toMatch(/questions/); // ask when unsure
  });

  it("wraps the file text, lists candidates by id, and omits answers on the first pass", () => {
    const out = fileAnalysis.render({
      fileText: "A journey map across onboarding touchpoints.",
      candidates: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Customer Journey Mapping",
          entityType: "skills",
          description: "Mapping a customer's experience across touchpoints.",
        },
      ],
    });
    expect(out).toContain("<document>");
    expect(out).toContain("A journey map across onboarding touchpoints.");
    expect(out).toContain("<candidates>");
    expect(out).toContain("[11111111-1111-4111-8111-111111111111]");
    expect(out).toContain("Customer Journey Mapping (skills)");
    expect(out).not.toContain("<user_input>");
  });

  it("shows '(no candidates found)' when the candidate list is empty", () => {
    const out = fileAnalysis.render({ fileText: "x", candidates: [] });
    expect(out).toContain("(no candidates found)");
  });

  it("wraps prior clarification answers as untrusted user_input", () => {
    const out = fileAnalysis.render({
      fileText: "x",
      candidates: [],
      priorAnswers: [{ question: "Which project?", answer: "OUAT" }],
    });
    expect(out).toContain("<user_input>");
    expect(out).toContain("Q: Which project?");
    expect(out).toContain("A: OUAT");
  });
});
