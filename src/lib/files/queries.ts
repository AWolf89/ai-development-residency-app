/**
 * Thin, read-only data access for a user's uploaded files.
 *
 * A humble query wrapper (no business logic) used by the files page Server
 * Component. Row-Level Security guarantees it only ever returns the signed-in
 * user's own rows, which is why it takes an already-authenticated server client.
 */
import type { createClient } from "@/lib/supabase/server";
import type { FileRow } from "./mappers";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const FILE_COLUMNS =
  "id, file_name, mime_type, size_bytes, created_at, storage_path";

/** All of the signed-in user's uploaded files, newest first. */
export async function getFiles(
  supabase: ServerClient,
  userId: string
): Promise<FileRow[]> {
  const { data } = await supabase
    .from("files")
    .select(FILE_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (data ?? []) as FileRow[];
}
