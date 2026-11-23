/**
 * Unit tests for the claim lifecycle reducer (ADR-0022 §3). Pins the precedence between the
 * stored human decisions and the computed evidence signals — the correctness the ADR flags as
 * the bug the tests must catch (e.g. `user_confirmed` must not mask a real `challenged`).
 */
import { describe, it, expect } from "vitest";
import {
  computeLifecycleStatus,
  normalizeStoredDecision,
  isActiveLifecycle,
  claimLifecycleStateSchema,
  type ClaimEvidenceSignals,
} from "./lifecycle";

/** No open signals — the baseline a bare draft sees. */
const NONE: ClaimEvidenceSignals = {
  hasSupportingEvidence: false,
  hasOpenGap: false,
  hasOpenChallenge: false,
};

describe("normalizeStoredDecision", () => {
  it("keeps the two authoritative human decisions", () => {
    expect(normalizeStoredDecision("user_confirmed")).toBe("user_confirmed");
    expect(normalizeStoredDecision("archived")).toBe("archived");
  });

  it("collapses the baseline and any computed/unknown value to draft", () => {
    expect(normalizeStoredDecision("draft")).toBe("draft");
    expect(normalizeStoredDecision("supported")).toBe("draft");
    expect(normalizeStoredDecision("needs_investigation")).toBe("draft");
    expect(normalizeStoredDecision("challenged")).toBe("draft");
    expect(normalizeStoredDecision("garbage")).toBe("draft");
  });
});

describe("computeLifecycleStatus — computed states from a draft baseline", () => {
  it("is draft when nothing is substantiated, confirmed, or flagged", () => {
    expect(computeLifecycleStatus("draft", NONE)).toBe("draft");
  });

  it("is supported with evidence and no open gap", () => {
    expect(
      computeLifecycleStatus("draft", { ...NONE, hasSupportingEvidence: true })
    ).toBe("supported");
  });

  it("is needs_investigation when an open gap stands (even with some evidence)", () => {
    expect(
      computeLifecycleStatus("draft", { ...NONE, hasOpenGap: true })
    ).toBe("needs_investigation");
    expect(
      computeLifecycleStatus("draft", {
        hasSupportingEvidence: true,
        hasOpenGap: true,
        hasOpenChallenge: false,
      })
    ).toBe("needs_investigation");
  });

  it("is challenged when an open challenge stands", () => {
    expect(
      computeLifecycleStatus("draft", { ...NONE, hasOpenChallenge: true })
    ).toBe("challenged");
  });
});

describe("computeLifecycleStatus — stored human decisions and precedence", () => {
  it("reflects an explicit user confirmation", () => {
    expect(computeLifecycleStatus("user_confirmed", NONE)).toBe(
      "user_confirmed"
    );
  });

  it("lets an open challenge surface even over a user-confirmed claim (ADR-0022 §3)", () => {
    expect(
      computeLifecycleStatus("user_confirmed", {
        ...NONE,
        hasOpenChallenge: true,
      })
    ).toBe("challenged");
  });

  it("clears back to user_confirmed once the challenge is resolved", () => {
    expect(
      computeLifecycleStatus("user_confirmed", {
        ...NONE,
        hasOpenChallenge: false,
      })
    ).toBe("user_confirmed");
  });

  it("archived wins outright, even over an open challenge", () => {
    expect(
      computeLifecycleStatus("archived", {
        hasSupportingEvidence: true,
        hasOpenGap: true,
        hasOpenChallenge: true,
      })
    ).toBe("archived");
  });

  it("user_confirmed outranks the computed supported/needs_investigation states", () => {
    expect(
      computeLifecycleStatus("user_confirmed", { ...NONE, hasOpenGap: true })
    ).toBe("user_confirmed");
    expect(
      computeLifecycleStatus("user_confirmed", {
        ...NONE,
        hasSupportingEvidence: true,
      })
    ).toBe("user_confirmed");
  });
});

describe("isActiveLifecycle", () => {
  it("excludes only archived claims from the active profile", () => {
    expect(isActiveLifecycle("archived")).toBe(false);
    for (const s of [
      "draft",
      "needs_investigation",
      "supported",
      "user_confirmed",
      "challenged",
    ] as const) {
      expect(isActiveLifecycle(s)).toBe(true);
    }
  });
});

describe("claimLifecycleStateSchema", () => {
  it("accepts exactly the six states", () => {
    for (const s of [
      "draft",
      "needs_investigation",
      "supported",
      "user_confirmed",
      "challenged",
      "archived",
    ]) {
      expect(claimLifecycleStateSchema.safeParse(s).success).toBe(true);
    }
    expect(claimLifecycleStateSchema.safeParse("confirmed").success).toBe(false);
  });
});
