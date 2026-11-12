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
  }): Promise<void>;
}

export type SaveDecisionRecordParams = {
  userId: string;
  input: unknown;
  /** Optional supporting artifact to link (AC4). */
  fileId?: string | null;
  /** When present, update that existing record instead of inserting (edit). */
  recordId?: string | null;
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

  const row = mapDecisionRecordToRow(validated.value, params.userId);

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
  });

  return { ok: true, recordId };
}
