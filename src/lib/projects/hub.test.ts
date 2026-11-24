import { describe, it, expect } from "vitest";
import { assembleProjectHub, type ProjectHubInput } from "./hub";
import type { ProjectView } from "./mappers";

const project: ProjectView = {
  id: "p1",
  name: "Billing Migration",
  role: "Lead engineer",
  organisation: "Acme",
  summary: "Migrated the billing platform.",
  status: "active",
  dateRangeLabel: "Mar–Aug 2025",
  createdAt: "2025-03-01",
};

function input(over: Partial<ProjectHubInput> = {}): ProjectHubInput {
  return {
    project,
    files: [],
    records: [],
    moments: [],
    claims: [],
    ...over,
  };
}

describe("assembleProjectHub — empty project (AC2: honest empties)", () => {
  it("yields empty sections, zero health, and no open questions", () => {
    const hub = assembleProjectHub(input());
    expect(hub.files).toEqual([]);
    expect(hub.decisions).toEqual([]);
    expect(hub.outcomes).toEqual([]);
    expect(hub.claims).toEqual([]);
    expect(hub.skills).toEqual([]);
    expect(hub.openQuestions).toEqual([]);
    expect(hub.health.claims).toBe(0);
    expect(hub.sourceCount).toBe(0);
    expect(hub.status).toBe("in_progress");
  });
});

describe("assembleProjectHub — sections from real rows", () => {
  it("maps files and counts them as sources", () => {
    const hub = assembleProjectHub(
      input({
        files: [
          { id: "f1", file_name: "deck.pdf", caption: "Q2" },
          { id: "f2", file_name: "notes.txt", caption: null },
        ],
      })
    );
    expect(hub.files).toEqual([
      { id: "f1", name: "deck.pdf", caption: "Q2" },
      { id: "f2", name: "notes.txt", caption: null },
    ]);
    expect(hub.sourceCount).toBe(2);
  });

  it("splits records into decisions (non-empty decision) and outcomes (non-empty outcome)", () => {
    const hub = assembleProjectHub(
      input({
        records: [
          {
            id: "r1",
            title: "Phased cutover",
            decision: "Moved 10% first",
            outcome: "Errors fell to 0.6%",
            category: "delivery",
          },
          {
            id: "r2",
            title: "Pilot",
            decision: "Ran a pilot",
            outcome: "   ",
            category: null,
          },
        ],
      })
    );
    expect(hub.decisions.map((d) => d.id)).toEqual(["r1", "r2"]);
    expect(hub.outcomes.map((o) => o.id)).toEqual(["r1"]); // r2's blank outcome is dropped
  });

  it("derives Skills from distinct known record categories, de-duplicated", () => {
    const hub = assembleProjectHub(
      input({
        records: [
          {
            id: "r1",
            title: "A",
            decision: null,
            outcome: null,
            category: "leadership",
          },
          {
            id: "r2",
            title: "B",
            decision: null,
            outcome: null,
            category: "leadership",
          },
          {
            id: "r3",
            title: "C",
            decision: null,
            outcome: null,
            category: "technical",
          },
          {
            id: "r4",
            title: "D",
            decision: null,
            outcome: null,
            category: "bogus",
          },
        ],
      })
    );
    expect(hub.skills).toEqual(["Leadership", "Technical"]);
  });

  it("badges each claim from its lifecycle and derives project health", () => {
    const hub = assembleProjectHub(
      input({
        claims: [
          { id: "c1", title: "Led migration", lifecycle: "supported" },
          {
            id: "c2",
            title: "Drove adoption",
            lifecycle: "needs_investigation",
          },
          { id: "c3", title: "Saved $200k", lifecycle: "challenged" },
        ],
      })
    );
    expect(hub.claims.map((c) => c.badge)).toEqual([
      "supported",
      "needs_evidence",
      "challenged",
    ]);
    expect(hub.health).toMatchObject({
      supported: 1,
      needEvidence: 1,
      challenged: 1,
      claims: 3,
    });
    expect(hub.status).toBe("needs_attention"); // an open challenge
  });
});

describe("assembleProjectHub — open questions", () => {
  it("raises a question for a record with no outcome and for each challenged claim", () => {
    const hub = assembleProjectHub(
      input({
        records: [
          {
            id: "r1",
            title: "Pilot",
            decision: "Ran a pilot",
            outcome: null,
            category: null,
          },
          {
            id: "r2",
            title: "Cutover",
            decision: "Did it",
            outcome: "Worked",
            category: null,
          },
        ],
        claims: [{ id: "c1", title: "Saved $200k", lifecycle: "challenged" }],
      })
    );
    const ids = hub.openQuestions.map((q) => q.id);
    expect(ids).toContain("outcome:r1"); // missing outcome
    expect(ids).not.toContain("outcome:r2"); // r2 has an outcome
    expect(ids).toContain("challenged:c1"); // challenged claim
    for (const q of hub.openQuestions) {
      expect(q.href.startsWith("/dashboard/decision-records/")).toBe(true);
    }
  });
});

describe("assembleProjectHub — archived project", () => {
  it("reads an archived project as Complete", () => {
    const hub = assembleProjectHub(
      input({ project: { ...project, status: "archived" } })
    );
    expect(hub.status).toBe("complete");
  });
});
