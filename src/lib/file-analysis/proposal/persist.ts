/**
 * The single writer for an approved proposal (MVP 2 Phase 2). Pure and DI-driven: it depends on
 * the existing `saveProject` and `saveDecisionRecord` *functions* (Dependency Inversion), not on
 * Supabase, so the whole persist path is unit-tested with injected fakes and no network.
 *
 * This is the ONLY place a proposal is written, and it is reached ONLY from the FSM's `persisting`
 * state, which is reachable ONLY from `awaiting_proposal_review` on `approve` (machine.ts) — so a
 * proposal is never persisted without explicit user approval (AC3, ADR-0013 HITL isolation).
 *
 * It reuses the exact deterministic save paths the manual forms use, so a proposed save and a
 * hand-typed save create the same rows (project → records, each linked to the file at its cited
 * passage, each gaining a backing claim via `ensureClaim`) — no duplicated persistence logic.
 */
import type { SaveProjectParams, SaveProjectResult } from "@/lib/projects/save";
import type {
  SaveDecisionRecordParams,
  SaveResult,
} from "@/lib/decision-records/save";
import type { DecisionRecordFields } from "@/lib/decision-records/evidence-text";
import type { ProposalResult, ProposedProject, ProposedRecord } from "./types";

/** A persist failure (validation or a repository error). Commands throw; they don't return codes. */
export class ProposalPersistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalPersistError";
  }
}

/** The injected save seam — the real functions in production, fakes in tests. */
export type ProposalPersistDeps = {
  saveProject(params: SaveProjectParams): Promise<SaveProjectResult>;
  saveDecisionRecord(params: SaveDecisionRecordParams): Promise<SaveResult>;
  /**
   * Index a saved record as searchable evidence so the Gap Check and Investigation can retrieve it
   * (GF4). Injected like the save seams; the orchestrator binds the real per-user indexer. Called
   * best-effort — the record is already written, so an indexing failure never fails the proposal,
   * mirroring the manual-form and interview save paths.
   */
  indexEvidence(params: {
    recordId: string;
    fields: DecisionRecordFields;
  }): Promise<void>;
};

export type PersistProposalParams = {
  userId: string;
  fileId: string;
  project: ProposedProject | null;
  records: ProposedRecord[];
};

/** Map a proposed project onto the `ProjectInput`-shaped payload `saveProject` validates. */
function projectInput(project: ProposedProject) {
  return {
    name: project.name,
    organisation: project.organisation,
    summary: project.summary,
    startedOn: project.startedOn,
    endedOn: project.endedOn,
    status: "active" as const,
  };
}

/** The evidence-text fields for a proposed record (cue/why are blank-as-undefined, not null). */
function evidenceFields(record: ProposedRecord): DecisionRecordFields {
  return {
    title: record.title,
    situation: record.situation,
    cue: record.cue ?? undefined,
    decision: record.decision,
    why: record.why ?? undefined,
    outcome: record.outcome,
  };
}

/** Map a proposed record onto the `DecisionRecordInput`-shaped payload `saveDecisionRecord` validates. */
function recordInput(record: ProposedRecord) {
  return {
    title: record.title,
    situation: record.situation,
    cue: record.cue ?? "",
    decision: record.decision,
    why: record.why ?? "",
    outcome: record.outcome,
    source: "artifact" as const, // backed by the uploaded file
    isMetric: false,
    contribution: record.contribution ?? "",
  };
}

/**
 * Persist an approved proposal: create the project (if one was proposed), then create each
 * evidence record linked to the file at its cited passage and stamped with the project id. Returns
 * the created ids. Any save failure throws `ProposalPersistError` so nothing is reported as saved
 * that was not.
 */
export async function persistProposal(
  deps: ProposalPersistDeps,
  params: PersistProposalParams
): Promise<ProposalResult> {
  let projectId: string | null = null;

  if (params.project) {
    const result = await deps.saveProject({
      userId: params.userId,
      input: projectInput(params.project),
    });
    if (!result.ok) {
      throw new ProposalPersistError(result.error);
    }
    projectId = result.projectId;
  }

  const recordIds: string[] = [];
  for (const record of params.records) {
    const result = await deps.saveDecisionRecord({
      userId: params.userId,
      input: recordInput(record),
      fileId: params.fileId,
      location: record.location,
      projectId,
    });
    if (!result.ok) {
      throw new ProposalPersistError(result.error);
    }
    recordIds.push(result.recordId);

    // GF4: index the saved record as searchable evidence, so a newly proposed claim is found by
    // the Gap Check and Investigation instead of still reading "no evidence". Best-effort: the
    // record is already written, so an indexing failure must not fail (or roll back) the proposal.
    try {
      await deps.indexEvidence({
        recordId: result.recordId,
        fields: evidenceFields(record),
      });
    } catch (err) {
      console.error("evidence indexing failed for proposed record", err);
    }
  }

  return { projectId, recordIds };
}
