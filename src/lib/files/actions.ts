"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recordUploadedFile } from "./record";
import { createSupabaseFileRepository } from "./repository";
import { indexUploadedFileEvidence } from "./index-upload";
import { indexEvidenceForCurrentUser } from "@/lib/rag/evidence-index";
import {
  setFileCaption,
  setFileProject,
  attachRecordToFile,
  detachRecordFromFile,
} from "./hub";
import { createSupabaseFileHubRepository } from "./hub-repository";

/** Result shape returned to the client after an upload or delete. */
export type FileActionState = {
  error?: string;
  notice?: string;
};

export type RecordUploadInput = {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Thin Server Action: resolves the signed-in user and delegates to the tested
 * `recordUploadedFile` orchestration. The bytes were already uploaded to Storage
 * by the browser; this only records (and re-validates) the metadata row.
 */
export async function recordUploadAction(
  input: RecordUploadInput
): Promise<FileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const repo = createSupabaseFileRepository(supabase);
  const result = await recordUploadedFile(repo, {
    userId: user.id,
    storagePath: input.storagePath,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  // Make the file searchable evidence: extract its text and index it (EIA/Gap Check).
  // Best-effort — the file is already saved, so an indexing failure must not surface as
  // an upload error; it just means this file won't match in the Gap Check until re-indexed.
  try {
    await indexUploadedFileEvidence(
      {
        fileId: result.id,
        storagePath: input.storagePath,
        fileName: input.fileName,
        mimeType: input.mimeType,
      },
      {
        download: (path) => repo.downloadObject(path),
        index: indexEvidenceForCurrentUser,
      }
    );
  } catch (err) {
    console.error("evidence indexing failed for uploaded file", err);
  }

  revalidatePath("/dashboard/files");
  return { notice: "Uploaded." };
}

/**
 * Thin Server Action: delete one of the signed-in user's files (object + row).
 * Reached only from the UI's explicit confirm step.
 */
export async function deleteFileAction(
  fileId: string
): Promise<FileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const repo = createSupabaseFileRepository(supabase);
  try {
    await repo.deleteFile({ id: fileId });
  } catch {
    return { error: "Could not delete that file. Please try again." };
  }

  revalidatePath("/dashboard/files");
  return { notice: "Deleted." };
}

/** Resolve the signed-in user and a file-hub repository, or redirect to login. */
async function hubRepoForUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { user, repo: createSupabaseFileHubRepository(supabase) };
}

/** Thin Server Action (file hub): set or clear a file's one-line caption. */
export async function setFileCaptionAction(
  fileId: string,
  caption: string
): Promise<FileActionState> {
  const { repo } = await hubRepoForUser();
  const result = await setFileCaption(repo, { fileId, caption });
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath(`/dashboard/files/${fileId}`);
  return { notice: "Saved." };
}

/** Thin Server Action (file hub): assign the file to a project (or clear it). */
export async function setFileProjectAction(
  fileId: string,
  projectId: string | null
): Promise<FileActionState> {
  const { repo } = await hubRepoForUser();
  try {
    await setFileProject(repo, { fileId, projectId });
  } catch {
    return { error: "Could not update the project. Please try again." };
  }
  revalidatePath(`/dashboard/files/${fileId}`);
  return { notice: "Saved." };
}

/** Thin Server Action (file hub): attach a decision record this file supports. */
export async function attachRecordToFileAction(
  fileId: string,
  decisionRecordId: string
): Promise<FileActionState> {
  const { user, repo } = await hubRepoForUser();
  try {
    await attachRecordToFile(repo, {
      userId: user.id,
      fileId,
      decisionRecordId,
    });
  } catch {
    return { error: "Could not link that record. Please try again." };
  }
  revalidatePath(`/dashboard/files/${fileId}`);
  return { notice: "Linked." };
}

/** Thin Server Action (file hub): remove a file↔record link by id. */
export async function detachRecordFromFileAction(
  fileId: string,
  linkId: string
): Promise<FileActionState> {
  const { repo } = await hubRepoForUser();
  try {
    await detachRecordFromFile(repo, { linkId });
  } catch {
    return { error: "Could not unlink that record. Please try again." };
  }
  revalidatePath(`/dashboard/files/${fileId}`);
  return { notice: "Unlinked." };
}
