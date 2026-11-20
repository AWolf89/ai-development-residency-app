/**
 * Save orchestration for a project — the testable core behind the thin Server
 * Action (ADR-0019).
 *
 * It depends on a `ProjectRepository` *interface* (Dependency Inversion), not on
 * the Supabase SDK, so it is unit-tested with an injected fake and no network.
 * The Supabase-backed implementation lives in `repository.ts` and the
 * `"use server"` wrapper in the route's `actions.ts`.
 *
 * Responsibilities: validate (the save gate — nothing is written when validation
 * fails), map to a write row stamped with the server-resolved user id, then
 * insert (create) or update (edit).
 */
import { validateProjectInput } from "./validation";
import { mapProjectInputToRow, type ProjectWriteRow } from "./mappers";

export interface ProjectRepository {
  insertProject(row: ProjectWriteRow): Promise<{ id: string }>;
  updateProject(id: string, row: ProjectWriteRow): Promise<void>;
}

export type SaveProjectParams = {
  userId: string;
  input: unknown;
  /** When present, update that existing project instead of inserting (edit). */
  projectId?: string | null;
};

export type SaveProjectResult =
  | { ok: true; projectId: string }
  | { ok: false; error: string };

export async function saveProject(
  repo: ProjectRepository,
  params: SaveProjectParams
): Promise<SaveProjectResult> {
  const validated = validateProjectInput(params.input);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  // The caller's id is always the server-resolved one, never a client-supplied value.
  const row = mapProjectInputToRow(validated.value, params.userId);

  if (params.projectId) {
    await repo.updateProject(params.projectId, row);
    return { ok: true, projectId: params.projectId };
  }

  const inserted = await repo.insertProject(row);
  return { ok: true, projectId: inserted.id };
}
