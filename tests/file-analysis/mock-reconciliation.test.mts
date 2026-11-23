// Boundary tests for cross-document reconciliation persistence (MVP 2 Phase 2, ADR-0023): the
// single writer (persistReconciliationFlags) against a fake repo. Load-bearing assertions (HITL,
// ADR-0013): nothing is written at ingest or while flags are still pending; only flags the user
// decided (accepted/dismissed) are written, each row carrying the file, kind, values, citations,
// and the user's disposition. Plus the grounding guarantee (no flag cites un-retrieved evidence).
// Run: NODE_OPTIONS=--conditions=react-server tsx tests/file-analysis/mock-reconciliation.test.mts
import assert from "node:assert/strict";
import {
  persistReconciliationFlags,
  type ReconciliationFlagRepository,
} from "../../src/lib/file-analysis/reconciliation/persist";
import { groundReconciliation } from "../../src/lib/file-analysis/reconciliation/compare";
import type {
  ReconciliationFlag,
  ReconciliationFlagRow,
} from "../../src/lib/file-analysis/reconciliation/types";
import type { Citation } from "../../src/lib/rag/types";

let pass = 0;
const ok = (c: boolean, m: string) => {
  assert.ok(c, m);
  console.log("ok  ", m);
  pass++;
};

const SOURCES: Citation[] = [
  { source: "file", id: "report.pdf", title: "Impact report" },
];

function makeRepo(): {
  repo: ReconciliationFlagRepository;
  counters: { inserts: number; rows: ReconciliationFlagRow[] };
} {
  const counters = { inserts: 0, rows: [] as ReconciliationFlagRow[] };
  const repo: ReconciliationFlagRepository = {
    async insertFlags(rows) {
      counters.inserts++;
      counters.rows.push(...rows);
      return { ids: rows.map((_, i) => `flag-${i}`) };
    },
  };
  return { repo, counters };
}

const flag = (over: Partial<ReconciliationFlag> = {}): ReconciliationFlag => ({
  kind: "metric",
  message: "Reduction disagrees with the impact report.",
  newValue: "19%",
  existingValue: "10%",
  citations: SOURCES,
  disposition: "pending",
  ...over,
});

async function main() {
  // 1) Pending-only flags are never written (nothing persisted at ingest without a decision).
  {
    const { repo, counters } = makeRepo();
    const res = await persistReconciliationFlags(repo, {
      userId: "u1",
      fileId: "file-1",
      flags: [flag(), flag({ kind: "date" })],
    });
    ok(counters.inserts === 0, "no insert when every flag is still pending");
    ok(res.savedIds.length === 0, "no ids returned when nothing is decided");
  }

  // 2) Only decided flags are written, mapped with file, values, citations, and disposition.
  {
    const { repo, counters } = makeRepo();
    const res = await persistReconciliationFlags(repo, {
      userId: "u1",
      fileId: "file-1",
      modelUsed: "test-model",
      promptVersion: "1.0.0",
      flags: [
        flag({ disposition: "accepted" }),
        flag({
          kind: "date",
          disposition: "dismissed",
          newValue: "Jan",
          existingValue: "Feb",
        }),
        flag({ kind: "ownership" }), // pending → excluded
      ],
    });
    ok(counters.inserts === 1, "one insert batch for the decided flags");
    ok(counters.rows.length === 2, "only the two decided flags are written");
    ok(
      counters.rows.every((r) => r.file_id === "file-1" && r.user_id === "u1"),
      "each row carries the file and owner"
    );
    ok(
      counters.rows[0].disposition === "accepted" &&
        counters.rows[1].disposition === "dismissed",
      "each row keeps the user's disposition"
    );
    ok(
      counters.rows[1].new_value === "Jan" &&
        counters.rows[1].existing_value === "Feb",
      "the disagreeing values are mapped"
    );
    ok(
      counters.rows[0].model_used === "test-model" &&
        counters.rows[0].prompt_version === "1.0.0",
      "model/prompt provenance is recorded"
    );
    ok(res.savedIds.length === 2, "returns an id per written flag");
  }

  // 3) Grounding: a flag citing an un-retrieved source is dropped before it can ever be written.
  {
    const grounded = groundReconciliation(
      {
        flags: [
          {
            kind: "metric",
            message: "real",
            citations: [{ source: "file", id: "report.pdf" }],
          },
          {
            kind: "date",
            message: "invented",
            citations: [{ source: "file", id: "ghost.pdf" }],
          },
        ],
      },
      SOURCES
    );
    ok(
      grounded.flags.length === 1 && grounded.dropped === 1,
      "ungrounded flag dropped at grounding"
    );

    const { repo, counters } = makeRepo();
    await persistReconciliationFlags(repo, {
      userId: "u1",
      fileId: "file-1",
      flags: grounded.flags.map((f) => ({
        ...f,
        disposition: "accepted" as const,
      })),
    });
    ok(
      counters.rows.length === 1 && counters.rows[0].message === "real",
      "only the grounded flag reaches the writer"
    );
  }

  console.log(`\n${pass} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
