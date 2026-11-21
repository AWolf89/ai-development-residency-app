import { describe, it, expect } from "vitest";
import {
  selectGapLearningEvidence,
  type LearningMomentRecord,
} from "./gap-evidence";
import type { LearningMomentKind } from "./types";

let n = 0;
function moment(
  over: Partial<LearningMomentRecord> & {
    kind?: LearningMomentKind;
    targetRoleId?: string | null;
    createdAt?: string;
  } = {}
): LearningMomentRecord {
  n += 1;
  return {
    id: over.id ?? `m${n}`,
    kind: over.kind ?? "speed",
    context: "ctx",
    shift: "shift",
    result: "result",
    duration: over.duration ?? null,
    targetRoleId: over.targetRoleId ?? null,
    createdAt: over.createdAt ?? "2026-11-01T00:00:00.000Z",
  };
}

const ROLE = "role-1";

describe("selectGapLearningEvidence", () => {
  it("drops moments tagged to a different role", () => {
    const out = selectGapLearningEvidence(
      [
        moment({ id: "keep", targetRoleId: ROLE }),
        moment({ id: "other", targetRoleId: "role-2" }),
        moment({ id: "general", targetRoleId: null }),
      ],
      ROLE
    );
    expect(out.map((m) => m.id)).toEqual(["keep", "general"]);
  });

  it("orders role-matched evidence before general (null-role) evidence", () => {
    const out = selectGapLearningEvidence(
      [
        moment({ id: "general", targetRoleId: null }),
        moment({ id: "matched", targetRoleId: ROLE }),
      ],
      ROLE
    );
    expect(out.map((m) => m.id)).toEqual(["matched", "general"]);
  });

  it("orders speed moments before other kinds within the same relevance tier", () => {
    const out = selectGapLearningEvidence(
      [
        moment({ id: "insight", kind: "insight", targetRoleId: ROLE }),
        moment({ id: "speed", kind: "speed", targetRoleId: ROLE }),
      ],
      ROLE
    );
    expect(out.map((m) => m.id)).toEqual(["speed", "insight"]);
  });

  it("orders newest first when relevance and kind tie", () => {
    const out = selectGapLearningEvidence(
      [
        moment({
          id: "older",
          kind: "speed",
          targetRoleId: ROLE,
          createdAt: "2026-10-01T00:00:00.000Z",
        }),
        moment({
          id: "newer",
          kind: "speed",
          targetRoleId: ROLE,
          createdAt: "2026-11-15T00:00:00.000Z",
        }),
      ],
      ROLE
    );
    expect(out.map((m) => m.id)).toEqual(["newer", "older"]);
  });

  it("applies the full precedence: role+speed, role+other, general+speed, general+other", () => {
    const out = selectGapLearningEvidence(
      [
        moment({ id: "gen-insight", kind: "insight", targetRoleId: null }),
        moment({ id: "gen-speed", kind: "speed", targetRoleId: null }),
        moment({ id: "role-insight", kind: "insight", targetRoleId: ROLE }),
        moment({ id: "role-speed", kind: "speed", targetRoleId: ROLE }),
      ],
      ROLE
    );
    expect(out.map((m) => m.id)).toEqual([
      "role-speed",
      "role-insight",
      "gen-speed",
      "gen-insight",
    ]);
  });

  it("returns an empty list when there are no moments", () => {
    expect(selectGapLearningEvidence([], ROLE)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [
      moment({ id: "a", targetRoleId: null }),
      moment({ id: "b", targetRoleId: ROLE }),
    ];
    const snapshot = input.map((m) => m.id);
    selectGapLearningEvidence(input, ROLE);
    expect(input.map((m) => m.id)).toEqual(snapshot);
  });
});
