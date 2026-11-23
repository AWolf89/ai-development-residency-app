/**
 * Grounding for a proposal (MVP 2 Phase 2). Pure and dependency-free: it turns a Zod-parsed
 * `ProposalOutput` from the model into the validated project + records the FSM will present,
 * dropping anything that is not safe to propose. This is the deterministic checkpoint between
 * the stochastic model and the HITL review (R3 §2: validate structurally, never trust the model).
 *
 * Rules:
 *   - A proposed **project** is kept only if it passes `validateProjectInput` (real name, valid
 *     ISO dates, start ≤ end). A malformed project is dropped to `null` rather than shown.
 *   - A proposed **record** is kept only if it carries a non-empty citation (`location`) AND
 *     passes `validateDecisionRecord` as an artifact-sourced record. A record with no supporting
 *     passage is ungrounded and dropped (AC2) — the model cannot assert evidence it did not cite.
 *   - `contribution` is passed through untouched (optional, never defaulted to "individual").
 *
 * Reuses the exact validators the manual forms use, so a proposed save and a hand-typed save are
 * held to the same gate (Humble Object / DRY, CLAUDE.md §3).
 */
import { validateProjectInput } from "@/lib/projects/validation";
import { validateDecisionRecord } from "@/lib/decision-records/validation";
import type { ProposalOutput, ProposedProject, ProposedRecord } from "./types";

export type GroundedProposal = {
  project: ProposedProject | null;
  records: ProposedRecord[];
  /** How many model records were dropped as ungrounded/invalid (for logging + the UI note). */
  droppedRecords: number;
};

/** Ground one model proposal into the validated project + records to present for review. */
export function groundProposal(output: ProposalOutput): GroundedProposal {
  const project = groundProject(output.project);

  const records: ProposedRecord[] = [];
  let droppedRecords = 0;

  for (const record of output.records) {
    const grounded = groundRecord(record);
    if (grounded) {
      records.push(grounded);
    } else {
      droppedRecords += 1;
    }
  }

  return { project, records, droppedRecords };
}

/** Validate a model project; drop (→ null) if it is malformed. */
function groundProject(
  project: ProposalOutput["project"]
): ProposedProject | null {
  if (!project) {
    return null;
  }
  const result = validateProjectInput({
    name: project.name,
    organisation: project.organisation ?? null,
    summary: project.summary ?? null,
    startedOn: project.startedOn ?? null,
    endedOn: project.endedOn ?? null,
    status: "active",
  });
  if (!result.ok) {
    return null;
  }
  return {
    name: result.value.name,
    organisation: result.value.organisation,
    startedOn: result.value.startedOn,
    endedOn: result.value.endedOn,
    summary: result.value.summary,
  };
}

/** Validate one model record as an artifact-sourced record; drop if ungrounded or invalid. */
function groundRecord(
  record: ProposalOutput["records"][number]
): ProposedRecord | null {
  // Citation is mandatory: an evidence record with no supporting passage is not grounded (AC2).
  const location = record.location?.trim() ?? "";
  if (location.length === 0) {
    return null;
  }

  const result = validateDecisionRecord({
    title: record.title,
    situation: record.situation,
    cue: record.cue ?? "",
    decision: record.decision,
    why: record.why ?? "",
    outcome: record.outcome,
    source: "artifact",
    isMetric: false,
    contribution: record.contribution ?? "",
  });
  if (!result.ok) {
    return null;
  }

  return {
    title: result.value.title,
    situation: result.value.situation,
    cue: result.value.cue ?? null,
    decision: result.value.decision,
    why: result.value.why ?? null,
    outcome: result.value.outcome,
    contribution: result.value.contribution ?? null,
    location,
    confidence: record.confidence,
  };
}
