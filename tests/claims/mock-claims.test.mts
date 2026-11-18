// Boundary test for the claims query layer (ADR-0015): the RLS-scoped read in
// src/lib/claims/queries.ts, against a fake Supabase client (no network, no DB). It asserts
// the query targets the right table with the owner + confirmed filters, and that rows are
// assembled into claims via the pure assembler.
// Run: NODE_OPTIONS=--conditions=react-server tsx tests/claims/mock-claims.test.mts
import assert from "node:assert/strict";
import { getClaims, getClaimRows } from "../../src/lib/claims/queries";
import type { ClaimRecordRow } from "../../src/lib/claims/types";

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
  order?: [string, { ascending: boolean }];
};

// A minimal chainable stand-in for the Supabase query builder used by queries.ts.
function fakeSupabase(rows: ClaimRecordRow[]) {
  const calls: Calls = { eq: [] };
  const builder = {
    select(sel: string) {
      calls.select = sel;
      return builder;
    },
    eq(col: string, val: unknown) {
      calls.eq.push([col, val]);
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

const ROWS: ClaimRecordRow[] = [
  {
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
  },
  {
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
  },
];

// 1. getClaimRows targets decision_records with the owner + confirmed filters, newest first.
{
  const { client, calls } = fakeSupabase(ROWS);
  const rows = await getClaimRows(client as never, "user-1");
  ok(calls.from === "decision_records", "reads from decision_records");
  ok(
    calls.eq.some(([c, v]) => c === "user_id" && v === "user-1"),
    "filters by the owner's user_id"
  );
  ok(
    calls.eq.some(([c, v]) => c === "status" && v === "confirmed"),
    "only confirmed records count as claims"
  );
  ok(
    calls.order?.[0] === "updated_at" && calls.order[1].ascending === false,
    "orders newest-updated first"
  );
  ok(rows.length === 2, "returns the rows");
}

// 2. getClaims assembles rows into claims (dedup sources, derive status, usage, history order).
{
  const { client } = fakeSupabase(ROWS);
  const claims = await getClaims(client as never, "user-1");
  ok(claims.length === 2, "two claims assembled");
  ok(claims[0].id === "r1" && claims[1].id === "r2", "row order preserved");
  ok(
    claims[0].sourceCount === 1 && claims[0].status === "evidence_linked",
    "deduped source → evidence_linked"
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
}

// 3. No rows → empty list (null data tolerated).
{
  const { client } = fakeSupabase(null as unknown as ClaimRecordRow[]);
  const claims = await getClaims(client as never, "user-1");
  ok(claims.length === 0, "null data assembles to an empty list");
}

console.log(`\n${pass} checks passed`);
