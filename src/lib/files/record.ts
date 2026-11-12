/**
 * Record-upload orchestration — the testable core behind the thin Server Action.
 *
 * The browser uploads the bytes straight to Supabase Storage (so large files
 * don't hit the serverless request-body cap), then calls the Server Action, which
 * delegates here to record the metadata row. It depends on a `FileRepository`
 * *interface* (Dependency Inversion), not the Supabase SDK, so it is unit-tested
 * with an injected fake and no network.
 *
 * Responsibilities: re-validate the reported metadata (defence in depth — the
 * client already validated for UX), confirm the storage key lives in the user's
 * own folder, insert the row, and clean up the uploaded object if anything fails
 * so storage and the table never drift apart.
 */
import { validateFileUpload } from "./validation";

export type FileInsertRow = {
  user_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
};

export interface FileRepository {
  insertFile(row: FileInsertRow): Promise<{ id: string }>;
  removeObject(storagePath: string): Promise<void>;
  deleteFile(params: { id: string }): Promise<void>;
}

export type RecordUploadParams = {
  userId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type RecordUploadResult =
  { ok: true; id: string } | { ok: false; error: string };

export async function recordUploadedFile(
  repo: FileRepository,
  params: RecordUploadParams
): Promise<RecordUploadResult> {
  const validated = validateFileUpload({
    fileName: params.fileName,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
  });
  if (!validated.ok) {
    await safeRemove(repo, params.storagePath);
    return { ok: false, error: validated.error };
  }

  // Defence in depth: the storage key must sit in the user's own folder. RLS
  // already scopes the files row and the storage object, but this stops a
  // mismatched key from being recorded against the wrong path.
  if (!params.storagePath.startsWith(`${params.userId}/`)) {
    await safeRemove(repo, params.storagePath);
    return {
      ok: false,
      error: "Upload could not be verified. Please try again.",
    };
  }

  const row: FileInsertRow = {
    user_id: params.userId,
    storage_path: params.storagePath,
    file_name: validated.value.fileName,
    mime_type: validated.value.mimeType,
    size_bytes: validated.value.sizeBytes,
  };

  try {
    const { id } = await repo.insertFile(row);
    return { ok: true, id };
  } catch {
    // Metadata insert failed — remove the orphaned object so storage and the
    // table stay in step.
    await safeRemove(repo, params.storagePath);
    return { ok: false, error: "Could not save your file. Please try again." };
  }
}

/** Best-effort cleanup: a leftover object in the user's own folder is harmless. */
async function safeRemove(
  repo: FileRepository,
  storagePath: string
): Promise<void> {
  try {
    await repo.removeObject(storagePath);
  } catch {
    // ignore
  }
}
