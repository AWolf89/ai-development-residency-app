import { describe, it, expect } from "vitest";
import { buildQueue, isQueueEmpty } from "./build";
import { EMPTY_SIGNALS, type InvestigationSignals } from "./types";

function signals(
  over: Partial<InvestigationSignals> = {}
): InvestigationSignals {
  return { ...EMPTY_SIGNALS, ...over };
}

describe("buildQueue — empty", () => {
  it("yields an empty queue from empty signals (invents nothing, AC4)", () => {
    const items = buildQueue(EMPTY_SIGNALS);
    expect(items).toEqual([]);
    expect(isQueueEmpty(items)).toBe(true);
  });
});

describe("buildQueue — mapping", () => {
  it("maps an unverified requirement to a gap-check deep-link", () => {
    const [item] = buildQueue(
      signals({
        unverifiedRequirements: [
          {
            requirementId: "r1",
            targetRoleId: "role-9",
            label: "SQL",
            verdict: "gap",
            updatedAt: "2026-11-01",
          },
        ],
      })
    );
    expect(item).toMatchObject({
      kind: "unverified_requirement",
      action: { href: "/dashboard/gap-check?role=role-9" },
    });
  });

  it("explains an 'unknown' verdict as investigate-before-gap", () => {
    const [item] = buildQueue(
      signals({
        unverifiedRequirements: [
          {
            requirementId: "r1",
            targetRoleId: "role-9",
            label: "SQL",
            verdict: "unknown",
            updatedAt: "2026-11-01",
          },
        ],
      })
    );
    expect(item.detail).toMatch(/investigate/i);
  });

  it("maps an overclaim flag to the record's review page", () => {
    const [item] = buildQueue(
      signals({
        overclaimFlags: [
          {
            flagId: "f1",
            decisionRecordId: "rec-1",
            recordTitle: "Led the migration",
            message: "Outcome overstated.",
            createdAt: "2026-11-02",
          },
        ],
      })
    );
    expect(item).toMatchObject({
      kind: "overclaim_flag",
      action: { href: "/dashboard/decision-records/rec-1/review" },
    });
  });

  it("maps a reconciliation conflict to document_conflict and complementary to link_suggestion", () => {
    const items = buildQueue(
      signals({
        reconciliation: [
          {
            flagId: "c1",
            fileId: "file-1",
            fileName: "report.pdf",
            kind: "metric",
            message: "19% vs 10%",
            createdAt: "2026-11-03",
          },
          {
            flagId: "c2",
            fileId: "file-2",
            fileName: "notes.pdf",
            kind: "complementary",
            message: "Adds detail",
            createdAt: "2026-11-03",
          },
        ],
      })
    );
    const conflict = items.find((i) => i.id === "document_conflict:c1");
    const link = items.find((i) => i.id === "link_suggestion:c2");
    expect(conflict?.kind).toBe("document_conflict");
    expect(link?.kind).toBe("link_suggestion");
  });

  it("routes a missing-info item by its subject", () => {
    const byRecord = buildQueue(
      signals({
        missingInfo: [
          {
            itemId: "m1",
            description: "Need the sample size",
            decisionRecordId: "rec-5",
            claimId: null,
            roleRequirementId: null,
            createdAt: "2026-11-04",
          },
        ],
      })
    )[0];
    expect(byRecord.action.href).toBe("/dashboard/decision-records/rec-5");

    const byRequirement = buildQueue(
      signals({
        missingInfo: [
          {
            itemId: "m2",
            description: "Which role?",
            decisionRecordId: null,
            claimId: null,
            roleRequirementId: "req-1",
            createdAt: "2026-11-04",
          },
        ],
      })
    )[0];
    expect(byRequirement.action.href).toBe("/dashboard/gap-check");
  });

  it("maps unreviewed files and unfinished interviews to their surfaces", () => {
    const items = buildQueue(
      signals({
        unreviewedFiles: [{ fileId: "file-9", fileName: "deck.pptx" }],
        unfinishedInterviews: [
          {
            sessionId: "s1",
            title: "Q3 project",
            status: "paused",
            updatedAt: "2026-11-05",
          },
        ],
      })
    );
    expect(items.find((i) => i.kind === "unreviewed_file")?.action.href).toBe(
      "/dashboard/files/file-9"
    );
    expect(
      items.find((i) => i.kind === "unfinished_interview")?.action.href
    ).toBe("/dashboard/interview");
  });
});

describe("buildQueue — prioritisation", () => {
  it("orders integrity risks before gaps before nudges", () => {
    const items = buildQueue(
      signals({
        unfinishedInterviews: [
          {
            sessionId: "s1",
            title: null,
            status: "active",
            updatedAt: "2026-11-05",
          },
        ],
        unverifiedRequirements: [
          {
            requirementId: "r1",
            targetRoleId: "role-9",
            label: "SQL",
            verdict: "gap",
            updatedAt: "2026-11-01",
          },
        ],
        reconciliation: [
          {
            flagId: "c1",
            fileId: "file-1",
            fileName: "report.pdf",
            kind: "metric",
            message: "conflict",
            createdAt: "2026-11-03",
          },
        ],
        overclaimFlags: [
          {
            flagId: "f1",
            decisionRecordId: "rec-1",
            recordTitle: "R",
            message: "m",
            createdAt: "2026-11-02",
          },
        ],
      })
    );
    expect(items.map((i) => i.kind)).toEqual([
      "document_conflict",
      "overclaim_flag",
      "unverified_requirement",
      "unfinished_interview",
    ]);
  });

  it("orders newest first within the same kind", () => {
    const items = buildQueue(
      signals({
        overclaimFlags: [
          {
            flagId: "old",
            decisionRecordId: "rec-1",
            recordTitle: "R",
            message: "m",
            createdAt: "2026-11-01",
          },
          {
            flagId: "new",
            decisionRecordId: "rec-2",
            recordTitle: "R",
            message: "m",
            createdAt: "2026-11-09",
          },
        ],
      })
    );
    expect(items.map((i) => i.id)).toEqual([
      "overclaim_flag:new",
      "overclaim_flag:old",
    ]);
  });
});

describe("buildQueue — dedup", () => {
  it("de-dups items that derive the same id", () => {
    const items = buildQueue(
      signals({
        unreviewedFiles: [
          { fileId: "file-1", fileName: "a.pdf" },
          { fileId: "file-1", fileName: "a.pdf" },
        ],
      })
    );
    expect(items).toHaveLength(1);
  });
});
