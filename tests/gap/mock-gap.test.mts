/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles mimic untyped payloads */
// Boundary tests for Gap Classification: the server-only classifier wiring and the save path,
// against a fake retriever, a fake model, and a fake Supabase (no network, no DB, one model
// path). Run: NODE_OPTIONS=--conditions=react-server tsx tests/gap/mock-gap.test.mts
import assert from "node:assert/strict";
import {
  classifyRoleRequirements,
  saveAssessments,
  type SaveClient,
} from "../../src/lib/gap/classifier";
import type { ClassifyDeps } from "../../src/lib/gap/classify";
import type { AssessmentRow, RequirementGap } from "../../src/lib/gap/types";
import type { Citation, Retrieval } from "../../src/lib/rag/types";

process.env.OPENROUTER_API_KEY = "sk-or-test";

let pass = 0;
const ok = (c: boolean, m: string) => {
  assert.ok(c, m);
  console.log("ok  ", m);
  pass++;
};

const evidenceCite: Citation = { source: "file", id: "resume.pdf", title: "resume.pdf" };
const found: Retrieval = {
  found: true,
  context: "[file · resume.pdf] Led a cloud migration.",
  sources: [evidenceCite],
  hits: [],
};
const notFound: Retrieval = {
  found: false,
  context: "NO_MATCHING_EVIDENCE_DATA",
  sources: [],
  hits: [],
};

// 1. classifyRoleRequirements wires retrieval -> model -> decision with injected deps
let modelCalls = 0;
const deps: ClassifyDeps = {
  retrieveEvidence: async (q) => (q.includes("nothing") ? notFound : found),
  retrieveReference: async () => notFound,
  runModel: async () => {
    modelCalls++;
    return {
      output: {
        verdict: "met",
        rationale: "Resume shows the migration.",
        citations: [{ source: "file", id: "resume.pdf" }],
      },
      attempts: 1,
      truncated: false,
    };
  },
};

const gaps = await classifyRoleRequirements(
  [
    { id: "req-1", text: "Lead cloud migrations" },
    { id: "req-2", text: "nothing on file for this one" },
  ],
  deps
);
ok(gaps.length === 2, "classifies every requirement");
ok(gaps[0].verdict === "met" && gaps[0].citations[0].id === "resume.pdf", "grounds the met verdict with a real citation");
ok(gaps[1].verdict === "unknown" && gaps[1].modelAttempts === 0, "no-evidence requirement short-circuits to unknown");
ok(modelCalls === 1, "the model is called only for the requirement that has evidence");

// 2. saveAssessments upserts one row per gap via the caller's Supabase client
let upserted: { rows: AssessmentRow[]; opts: any } | null = null;
const okClient: SaveClient = {
  from: (table: string) => {
    ok(table === "requirement_gap_assessments", "saves to requirement_gap_assessments");
    return {
      upsert: async (rows, opts) => {
        upserted = { rows, opts };
        return { error: null };
      },
    };
  },
};
await saveAssessments(gaps, { userId: "user-1", targetRoleId: "role-1" }, okClient);
ok(upserted!.rows.length === 2, "upserts one row per assessment");
ok(upserted!.opts.onConflict === "role_requirement_id", "upsert keeps one current row per requirement");
ok(
  upserted!.rows[0].user_id === "user-1" &&
    upserted!.rows[0].role_requirement_id === "req-1" &&
    upserted!.rows[0].target_role_id === "role-1" &&
    upserted!.rows[0].verdict === "met" &&
    typeof upserted!.rows[0].prompt_version === "string" &&
    typeof upserted!.rows[0].model_used === "string",
  "row carries ownership, verdict, and model/prompt version"
);

// 3. empty results write nothing
let touched = false;
await saveAssessments([], { userId: "u", targetRoleId: "r" }, {
  from: () => {
    touched = true;
    return { upsert: async () => ({ error: null }) };
  },
});
ok(!touched, "no assessments -> no database call");

// 4. a Supabase error is surfaced
const failClient: SaveClient = {
  from: () => ({ upsert: async () => ({ error: { message: "boom" } }) }),
};
const sample: RequirementGap = gaps[0];
await assert.rejects(
  saveAssessments([sample], { userId: "u", targetRoleId: "r" }, failClient),
  /saving gap assessments failed: boom/
);
ok(true, "Supabase error is surfaced");

console.log(`\n${pass} checks passed`);
