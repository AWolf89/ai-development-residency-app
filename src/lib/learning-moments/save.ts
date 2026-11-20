/**
 * Save orchestration for a learning moment — the testable core behind the thin Server Action
 * (ADR-0018).
 *
 * It depends on a `LearningMomentRepository` *interface* (Dependency Inversion), not on the
 * Supabase SDK, so it is unit-tested with an injected fake and no network. The Supabase-backed
 * implementation lives in `repository.ts` and the `"use server"` wrapper in the route's
 * `actions.ts`.
 *
 * Responsibilities: validate (AC4 gate — nothing is saved when validation fails), map to a
 * row, insert or update, and set the supporting-file link (AC3). It is only ever reached from
 * the explicit submit, so no empty record is created.
 */
import { validateLearningMoment } from "./validation";
import { mapLearningMomentToRow, type LearningMomentRow } from "./mappers";

export interface LearningMomentRepository {
  insertRecord(row: LearningMomentRow): Promise<{ id: string }>;
  updateRecord(id: string, row: LearningMomentRow): Promise<void>;
  /**
   * Make the moment's supporting-file link match `fileId`: replace any existing link, or
   * clear it when `fileId` is null. Idempotent, so re-saving or editing never creates
   * duplicate links.
   */
  setEvidenceLink(params: {
    userId: string;
    learningMomentId: string;
    fileId: string | null;
  }): Promise<void>;
}

export type SaveLearningMomentParams = {
  userId: string;
  input: unknown;
  /** Optional supporting artifact to link (AC3). */
  fileId?: string | null;
  /** When present, update that existing record instead of inserting (edit). */
  recordId?: string | null;
  /** Optional project this moment belongs to (ADR-0019). */
  projectId?: string | null;
};

export type SaveResult =
  { ok: true; recordId: string } | { ok: false; error: string };

export async function saveLearningMoment(
  repo: LearningMomentRepository,
  params: SaveLearningMomentParams
): Promise<SaveResult> {
  const validated = validateLearningMoment(params.input);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const row = mapLearningMomentToRow(
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
    learningMomentId: recordId,
    fileId: params.fileId ?? null,
  });

  return { ok: true, recordId };
}
