import { describe, it, expect } from "vitest";
import { toClaim, toClaims } from "./assemble";
import type { ClaimRecordRow, ClaimRow } from "./types";

/** Build the embedded decision_records row a claim projects over. */
function record(overrides: Partial<ClaimRecordRow> = {}): ClaimRecordRow {
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
    record_reviews: [],
    ...overrides,
  };
}

/** Wrap a record in a claims row (Phase 1 is 1:1). */
function claimRow(
  rec: ClaimRecordRow = record(),
  overrides: Partial<Omit<ClaimRow, "claim_evidence">> = {}
): ClaimRow {
  return {
    id: "c1",
    status: "draft",
    created_at: rec.created_at,
    updated_at: rec.updated_at,
    claim_evidence: [{ decision_records: rec }],
    ...overrides,
  };
}

describe("toClaim", () => {
  it("keeps the record id as id and exposes the claim id separately", () => {
    const claim = toClaim(claimRow(record({ id: "rec-9" }), { id: "claim-9" }))!;
    expect(claim.id).toBe("rec-9");
    expect(claim.claimId).toBe("claim-9");
  });

  it("dedupes source files and ignores null file ids", () => {
    const claim = toClaim(
      claimRow(
        record({
          evidence_links: [
            { file_id: "f1" },
            { file_id: "f1" },
            { file_id: null },
            { file_id: "f2" },
          ],
        })
      )
    )!;
    expect(claim.sourceFileIds).toEqual(["f1", "f2"]);
    expect(claim.sourceCount).toBe(2);
    expect(claim.status).toBe("evidence_linked");
  });

  it("derives self_reported_metric when flagged and unsupported", () => {
    const claim = toClaim(
      claimRow(record({ evidence_links: [], is_metric: true }))
    )!;
    expect(claim.status).toBe("self_reported_metric");
    expect(claim.isMetric).toBe(true);
  });

  it("derives recollection when unsupported and not a metric", () => {
    expect(toClaim(claimRow())!.status).toBe("recollection");
  });

  it("orders history newest version first", () => {
    const claim = toClaim(
      claimRow(
        record({
          record_versions: [
            { version_number: 1, created_at: "2026-10-28T00:00:00Z" },
            { version_number: 3, created_at: "2026-10-30T00:00:00Z" },
            { version_number: 2, created_at: "2026-10-29T00:00:00Z" },
          ],
        })
      )
    )!;
    expect(claim.history.map((h) => h.versionNumber)).toEqual([3, 2, 1]);
  });

  it("counts real usages (gap matches + interview origin)", () => {
    const claim = toClaim(
      claimRow(
        record({
          record_requirement_links: [{ id: "l1" }, { id: "l2" }],
          interview_turns: [{ id: "t1" }],
        })
      )
    )!;
    expect(claim.usage).toEqual({ requirementMatches: 2, fromInterview: true });
  });

  it("maps an unknown or null category to null", () => {
    expect(toClaim(claimRow(record({ category: "nope" })))!.category).toBeNull();
    expect(toClaim(claimRow(record({ category: null })))!.category).toBeNull();
    expect(toClaim(claimRow(record({ category: "technical" })))!.category).toBe(
      "technical"
    );
  });

  it("returns null when a claim has no backing record", () => {
    const orphan: ClaimRow = {
      id: "c-orphan",
      status: "draft",
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
      claim_evidence: [{ decision_records: null }],
    };
    expect(toClaim(orphan)).toBeNull();
  });
});

describe("toClaim — lifecycle (ADR-0022 §3)", () => {
  it("is supported when a source is linked", () => {
    const claim = toClaim(
      claimRow(record({ evidence_links: [{ file_id: "f1" }] }))
    )!;
    expect(claim.lifecycle).toBe("supported");
  });

  it("is needs_investigation when no source is linked (open gap)", () => {
    expect(toClaim(claimRow(record({ evidence_links: [] })))!.lifecycle).toBe(
      "needs_investigation"
    );
  });

  it("is challenged when a reviewer flag is still pending", () => {
    const claim = toClaim(
      claimRow(
        record({
          evidence_links: [{ file_id: "f1" }],
          record_reviews: [
            { record_review_flags: [{ disposition: "pending" }] },
          ],
        })
      )
    )!;
    expect(claim.lifecycle).toBe("challenged");
  });

  it("reflects a stored user confirmation when no challenge stands", () => {
    const claim = toClaim(
      claimRow(record({ evidence_links: [{ file_id: "f1" }] }), {
        status: "user_confirmed",
      })
    )!;
    expect(claim.lifecycle).toBe("user_confirmed");
  });

  it("ignores a resolved flag (dismissed/accepted is not an open challenge)", () => {
    const claim = toClaim(
      claimRow(
        record({
          evidence_links: [{ file_id: "f1" }],
          record_reviews: [
            {
              record_review_flags: [
                { disposition: "dismissed" },
                { disposition: "accepted" },
              ],
            },
          ],
        })
      )
    )!;
    expect(claim.lifecycle).toBe("supported");
  });
});

describe("toClaims", () => {
  it("preserves row order and skips orphaned claims", () => {
    const a = claimRow(record({ id: "a" }), { id: "ca" });
    const b = claimRow(record({ id: "b" }), { id: "cb" });
    const orphan: ClaimRow = {
      id: "co",
      status: "draft",
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
      claim_evidence: [],
    };
    const claims = toClaims([a, orphan, b]);
    expect(claims.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
