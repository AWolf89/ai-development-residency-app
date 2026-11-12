"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recordUploadedFile } from "./record";
import { createSupabaseFileRepository } from "./repository";

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
