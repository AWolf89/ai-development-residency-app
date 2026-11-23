// Boundary test for the claims query layer (ADR-0015, ADR-0022): the RLS-scoped read in
// src/lib/claims/queries.ts, against a fake Supabase client (no network, no DB). It asserts
// the query targets the `claims` table with the owner filter, excludes archived claims, and
// that rows are assembled into claims (via the backing decision record) by the pure assembler.
// Run: NODE_OPTIONS=--conditions=react-server tsx tests/claims/mock-claims.test.mts
import assert from "node:assert/strict";
import { getClaims, getClaimRows } from "../../src/lib/claims/queries";
import type { ClaimRecordRow, ClaimRow } from "../../src/lib/claims/types";

let pass = 0;
const ok = (c: boolean, m: string) => {
  assert.ok(c, m);
  console.log("ok  ", m);
  pass++;
};

type Calls = {
  from?: string;
  select?: string;
  eq: [string, unknown][];
  neq: [string, unknown][];
  order?: [string, { ascending: boolean }];
};

// A minimal chainable stand-in for the Supabase query builder used by queries.ts.
function fakeSupabase(rows: ClaimRow[]) {
  const calls: Calls = { eq: [], neq: [] };
  const builder = {
    select(sel: string) {
      calls.select = sel;
      return builder;
    },
    eq(col: string, val: unknown) {
      calls.eq.push([col, val]);
      return builder;
    },
    neq(col: string, val: unknown) {
      calls.neq.push([col, val]);
      return builder;
    },
    order(col: string, opts: { ascending: boolean }) {
      calls.order = [col, opts];
      return Promise.resolve({ data: rows, error: null });
    },
  };
  const client = {
    from(table: string) {
      calls.from = table;
      return builder;
    },
  };
  return { client, calls };
}

/** Wrap a backing decision record in a claims row (Phase 1 is 1:1). */
function claimRow(id: string, record: ClaimRecordRow): ClaimRow {
  return {
    id,
    status: "draft",
    created_at: record.created_at,
    updated_at: record.updated_at,
    claim_evidence: [{ decision_records: record }],
  };
}

const ROWS: ClaimRow[] = [
  claimRow("c1", {
    id: "r1",
    title: "Co-led the billing migration",
    decision: "Phased cutover",
    category: "delivery",
    is_metric: false,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-10T00:00:00Z",
    evidence_links: [{ file_id: "f1" }, { file_id: "f1" }, { file_id: null }],
    record_versions: [
      { version_number: 1, created_at: "2026-11-01T00:00:00Z" },
      { version_number: 2, created_at: "2026-11-05T00:00:00Z" },
    ],
    record_requirement_links: [{ id: "l1" }],
    interview_turns: [{ id: "t1" }],
    record_reviews: [],
  }),
  claimRow("c2", {
    id: "r2",
    title: "Reduced invoice errors by 30%",
    decision: null,
    category: null,
    is_metric: true,
    created_at: "2026-11-02T00:00:00Z",
    updated_at: "2026-11-03T00:00:00Z",
    evidence_links: [],
    record_versions: [],
    record_requirement_links: [],
    interview_turns: [],
    record_reviews: [],
  }),
];

// 1. getClaimRows targets claims with the owner filter, excludes archived, newest first.
{
  const { client, calls } = fakeSupabase(ROWS);
  const rows = await getClaimRows(client as never, "user-1");
  ok(calls.from === "claims", "reads from claims");
  ok(
    calls.eq.some(([c, v]) => c === "user_id" && v === "user-1"),
    "filters by the owner's user_id"
  );
  ok(
    calls.neq.some(([c, v]) => c === "status" && v === "archived"),
    "excludes archived claims from the active profile"
  );
  ok(
    calls.order?.[0] === "updated_at" && calls.order[1].ascending === false,
    "orders newest-updated first"
  );
  ok(rows.length === 2, "returns the rows");
}

// 2. getClaims assembles rows into claims (record id as id, claim id separate, dedup, usage).
{
  const { client } = fakeSupabase(ROWS);
  const claims = await getClaims(client as never, "user-1");
  ok(claims.length === 2, "two claims assembled");
  ok(
    claims[0].id === "r1" && claims[1].id === "r2",
    "record id kept as id, order preserved"
  );
  ok(
    claims[0].claimId === "c1" && claims[1].claimId === "c2",
    "claim aggregate id exposed separately"
  );
  ok(
    claims[0].sourceCount === 1 && claims[0].status === "evidence_linked",
    "deduped source → evidence_linked"
  );
  ok(
    claims[0].lifecycle === "supported",
    "linked source → supported lifecycle"
  );
  ok(
    claims[0].history.map((h) => h.versionNumber).join(",") === "2,1",
    "history newest version first"
  );
  ok(
    claims[0].usage.requirementMatches === 1 && claims[0].usage.fromInterview,
    "usage reflects gap match + interview origin"
  );
  ok(
    claims[1].status === "self_reported_metric",
    "unsupported metric → self_reported_metric"
  );
  ok(
    claims[1].lifecycle === "needs_investigation",
    "no linked source → needs_investigation lifecycle"
  );
}

// 3. No rows → empty list (null data tolerated).
{
  const { client } = fakeSupabase(null as unknown as ClaimRow[]);
  const claims = await getClaims(client as never, "user-1");
  ok(claims.length === 0, "null data assembles to an empty list");
}

console.log(`\n${pass} checks passed`);
