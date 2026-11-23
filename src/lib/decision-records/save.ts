/**
 * Save orchestration for a decision record — the testable core behind the thin
 * Server Action.
 *
 * It depends on a `DecisionRecordRepository` *interface* (Dependency Inversion),
 * not on the Supabase SDK, so it can be unit-tested with an injected fake and no
 * network. The Supabase-backed implementation lives in `repository.ts` and the
 * `"use server"` wrapper in `actions.ts`.
 *
 * Responsibilities: validate (AC6), map to a row, insert or update, and set the
 * supporting-file link (AC4). It is only ever reached from the explicit confirm
 * step, which is what satisfies AC3.
 */
import { validateDecisionRecord } from "./validation";
import { mapDecisionRecordToRow, type DecisionRecordRow } from "./mappers";

export interface DecisionRecordRepository {
  insertRecord(row: DecisionRecordRow): Promise<{ id: string }>;
  updateRecord(id: string, row: DecisionRecordRow): Promise<void>;
  /**
   * Make the record's supporting-file link match `fileId`: replace any existing
   * link, or clear it when `fileId` is null. Idempotent, so re-saving or editing
   * never creates duplicate links.
   */
  setEvidenceLink(params: {
    userId: string;
    decisionRecordId: string;
    fileId: string | null;
    /** Optional supporting span (page/section/char range) the link cites (ADR-0022 §5.2). */
    location?: string | null;
  }): Promise<void>;
  /**
   * Ensure a claim backs this record (ADR-0022): create a `claims` row and the
   * `claim_evidence` link when none exists yet. Idempotent — a record edited after its claim
   * already exists is left alone — so the one-claim-per-record (1:1) invariant holds and the
   * /dashboard projection keeps working for records saved after the migration.
   */
  ensureClaim(params: {
    userId: string;
    decisionRecordId: string;
  }): Promise<void>;
}

export type SaveDecisionRecordParams = {
  userId: string;
  input: unknown;
  /** Optional supporting artifact to link (AC4). */
  fileId?: string | null;
  /** Optional supporting passage/location for that artifact (ADR-0022 §5.2). */
  location?: string | null;
  /** When present, update that existing record instead of inserting (edit). */
  recordId?: string | null;
  /** Optional project this record belongs to (ADR-0019). */
  projectId?: string | null;
};

export type SaveResult =
  { ok: true; recordId: string } | { ok: false; error: string };

export async function saveDecisionRecord(
  repo: DecisionRecordRepository,
  params: SaveDecisionRecordParams
): Promise<SaveResult> {
  const validated = validateDecisionRecord(params.input);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const row = mapDecisionRecordToRow(
    validated.value,
    params.userId,
    params.projectId ?? null
  );

  let recordId: string;
  if (params.recordId) {
    await repo.updateRecord(params.recordId, row);
    recordId = params.recordId;
  } else {
    const inserted = await repo.insertRecord(row);
    recordId = inserted.id;
  }

  // Keep the file link in sync (set, replace, or clear) — idempotent on edit.
  await repo.setEvidenceLink({
    userId: params.userId,
    decisionRecordId: recordId,
    fileId: params.fileId ?? null,
    location: params.location ?? null,
  });

  // Ensure the record has a backing claim (ADR-0022) — idempotent, so an edit of an existing
  // record does not create a second claim.
  await repo.ensureClaim({
    userId: params.userId,
    decisionRecordId: recordId,
  });

  return { ok: true, recordId };
}
