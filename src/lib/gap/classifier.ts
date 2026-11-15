import "server-only";
import { createClient } from "@/lib/supabase/server";
import { retriever } from "@/lib/rag/retrieve";
import { runStructured } from "@/lib/llm/run";
import { supabaseSink } from "@/lib/llm/supabase-sink";
import { LLM_CONFIG } from "@/lib/llm/config";
import { gapClassification } from "@/lib/llm/prompts/gap-classification";
import {
  classifyRequirements,
  toAssessmentRow,
  type ClassifyDeps,
  type GapModelFn,
  type RequirementInput,
} from "./classify";
import { gapModelOutputSchema, type AssessmentRow, type RequirementGap } from "./types";

// The Gap Classification boundary (Humble Object). It wires the real retriever and the model
// gateway (runStructured + supabaseSink — one model path, ADR-0009) into the pure decision
// logic, and persists results. Dependencies are injected so the whole flow is tested with a
// fake retriever, a fake model, and a fake Supabase (tests/gap/) — no network, no database.

/** The one call per requirement, delegated to the gateway's structured-output pipeline. */
const runModel: GapModelFn = async ({
  requirementText,
  evidenceContext,
  referenceContext,
}) => {
  const { data, attempts, truncated } = await runStructured({
    prompt: gapClassification,
    input: { requirementText, evidenceContext, referenceContext },
    schema: gapModelOutputSchema,
    sink: supabaseSink,
  });
  return { output: data, attempts, truncated };
};

/** Production dependencies: the signed-in user's retriever (RLS) + the gateway model call. */
export function defaultDeps(): ClassifyDeps {
  return {
    retrieveEvidence: (q) => retriever.retrieveEvidence(q),
    retrieveReference: (q) => retriever.retrieveReference(q),
    runModel,
  };
}

/** Classify every requirement of a target role, grounded in the user's own evidence. */
export async function classifyRoleRequirements(
  requirements: RequirementInput[],
  deps: ClassifyDeps = defaultDeps()
): Promise<RequirementGap[]> {
  return classifyRequirements(requirements, deps);
}

/** Just the Supabase surface the save path uses, so tests can supply a tiny fake. */
export type SaveClient = {
  from: (table: string) => {
    upsert: (
      rows: AssessmentRow[],
      options: { onConflict: string }
    ) => Promise<{ error: { message: string } | null }>;
  };
};

/**
 * Persist assessments to `requirement_gap_assessments`, one current row per requirement
 * (upsert on role_requirement_id). Runs under the caller's session, so own-rows RLS applies.
 */
export async function saveAssessments(
  gaps: RequirementGap[],
  ctx: { userId: string; targetRoleId: string },
  client?: SaveClient
): Promise<void> {
  if (gaps.length === 0) return;
  const supabase = client ?? ((await createClient()) as unknown as SaveClient);
  const rows = gaps.map((gap) =>
    toAssessmentRow(gap, {
      userId: ctx.userId,
      targetRoleId: ctx.targetRoleId,
      modelUsed: LLM_CONFIG.models[gapClassification.purpose][0],
      promptVersion: gapClassification.version,
    })
  );
  const { error } = await supabase
    .from("requirement_gap_assessments")
    .upsert(rows, { onConflict: "role_requirement_id" });
  if (error) throw new Error(`saving gap assessments failed: ${error.message}`);
}
