/**
 * File detail hub orchestration (Fork B, ADR-0019) — the testable core behind the
 * thin Server Actions.
 *
 * Depends on a `FileHubRepository` *interface* (Dependency Inversion), so it is
 * unit-tested with an injected fake and no network. The Supabase-backed adapter
 * lives in `hub-repository.ts`. Row ownership (the file, the project, the linked
 * record) is enforced by RLS at the database layer, not here.
 *
 * The hub lets a user caption a file, assign it to a project, and attach/detach
 * the decision records it supports — it never duplicates record narrative onto
 * the file (that stays in decision_records).
 */
import { validateFileCaption } from "./validation";

export interface FileHubRepository {
  setCaption(fileId: string, caption: string | null): Promise<void>;
  setProject(fileId: string, projectId: string | null): Promise<void>;
  insertRecordLink(params: {
    userId: string;
    fileId: string;
    decisionRecordId: string;
  }): Promise<void>;
  deleteRecordLink(linkId: string): Promise<void>;
}

export type HubResult = { ok: true } | { ok: false; error: string };

/** Set (or clear) a file's one-line caption, gated by the caption validator. */
export async function setFileCaption(
  repo: FileHubRepository,
  params: { fileId: string; caption: unknown }
): Promise<HubResult> {
  const validated = validateFileCaption(params.caption);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  await repo.setCaption(params.fileId, validated.value);
  return { ok: true };
}

/** Assign a file to a project, or clear the assignment when projectId is null. */
export async function setFileProject(
  repo: FileHubRepository,
  params: { fileId: string; projectId: string | null }
): Promise<HubResult> {
  await repo.setProject(params.fileId, params.projectId);
  return { ok: true };
}

/** Attach a decision record this file supports (via evidence_links). */
export async function attachRecordToFile(
  repo: FileHubRepository,
  params: { userId: string; fileId: string; decisionRecordId: string }
): Promise<HubResult> {
  await repo.insertRecordLink(params);
  return { ok: true };
}

/** Remove a file↔record link by its id. */
export async function detachRecordFromFile(
  repo: FileHubRepository,
  params: { linkId: string }
): Promise<HubResult> {
  await repo.deleteRecordLink(params.linkId);
  return { ok: true };
}
