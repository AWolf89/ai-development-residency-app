import { describe, it, expect } from "vitest";
import { toClaim, toClaims } from "./assemble";
import type { ClaimRecordRow } from "./types";

function row(overrides: Partial<ClaimRecordRow> = {}): ClaimRecordRow {
  return {
    id: "r1",
    title: "Co-led the billing migration",
    decision: "Picked a phased cutover",
    category: "delivery",
    is_metric: false,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-10T00:00:00Z",
    evidence_links: [],
    record_versions: [],
    record_requirement_links: [],
    interview_turns: [],
    ...overrides,
  };
}

describe("toClaim", () => {
  it("dedupes source files and ignores null file ids", () => {
    const claim = toClaim(
      row({
        evidence_links: [
          { file_id: "f1" },
          { file_id: "f1" },
          { file_id: null },
          { file_id: "f2" },
        ],
      })
    );
    expect(claim.sourceFileIds).toEqual(["f1", "f2"]);
    expect(claim.sourceCount).toBe(2);
    expect(claim.status).toBe("evidence_linked");
  });

  it("derives self_reported_metric when flagged and unsupported", () => {
    const claim = toClaim(row({ evidence_links: [], is_metric: true }));
    expect(claim.status).toBe("self_reported_metric");
    expect(claim.isMetric).toBe(true);
  });

  it("derives recollection when unsupported and not a metric", () => {
    expect(toClaim(row()).status).toBe("recollection");
  });

  it("orders history newest version first", () => {
    const claim = toClaim(
      row({
        record_versions: [
          { version_number: 1, created_at: "2026-10-28T00:00:00Z" },
          { version_number: 3, created_at: "2026-10-30T00:00:00Z" },
          { version_number: 2, created_at: "2026-10-29T00:00:00Z" },
        ],
      })
    );
    expect(claim.history.map((h) => h.versionNumber)).toEqual([3, 2, 1]);
  });

  it("counts real usages (gap matches + interview origin)", () => {
    const claim = toClaim(
      row({
        record_requirement_links: [{ id: "l1" }, { id: "l2" }],
        interview_turns: [{ id: "t1" }],
      })
    );
    expect(claim.usage).toEqual({ requirementMatches: 2, fromInterview: true });
  });

  it("maps an unknown or null category to null", () => {
    expect(toClaim(row({ category: "nope" })).category).toBeNull();
    expect(toClaim(row({ category: null })).category).toBeNull();
    expect(toClaim(row({ category: "technical" })).category).toBe("technical");
  });

  it("tolerates missing relation arrays", () => {
    const bare = {
      id: "r2",
      title: "t",
      decision: null,
      category: null,
      is_metric: false,
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
    } as unknown as ClaimRecordRow;
    const claim = toClaim(bare);
    expect(claim.sourceCount).toBe(0);
    expect(claim.history).toEqual([]);
    expect(claim.usage).toEqual({ requirementMatches: 0, fromInterview: false });
  });
});

describe("toClaims", () => {
  it("preserves row order", () => {
    const claims = toClaims([row({ id: "a" }), row({ id: "b" })]);
    expect(claims.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
