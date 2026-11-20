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
  "id, file_name, mime_type, size_bytes, created_at, storage_path, caption, project_id";

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

export type FileLinkedRecord = { linkId: string; recordId: string; title: string };

export type FileDetail = {
  id: string;
  fileName: string;
  caption: string | null;
  projectId: string | null;
  sizeBytes: number | null;
  createdAt: string;
  linkedRecords: FileLinkedRecord[];
};

/**
 * One file the user owns, plus the decision records it supports (via
 * evidence_links), for the file detail hub. Returns null when not found / owned.
 */
export async function getFileDetail(
  supabase: ServerClient,
  userId: string,
  fileId: string
): Promise<FileDetail | null> {
  const { data: file } = await supabase
    .from("files")
    .select("id, file_name, caption, project_id, size_bytes, created_at")
    .eq("user_id", userId)
    .eq("id", fileId)
    .maybeSingle();

  if (!file) {
    return null;
  }

  const { data: links } = await supabase
    .from("evidence_links")
    .select("id, decision_record_id, decision_records(title)")
    .eq("file_id", fileId)
    .not("decision_record_id", "is", null);

  const linkedRecords: FileLinkedRecord[] = (links ?? []).map((row) => {
    const rec = row.decision_records as
      | { title: string }
      | { title: string }[]
      | null;
    const title = Array.isArray(rec) ? rec[0]?.title : rec?.title;
    return {
      linkId: row.id as string,
      recordId: row.decision_record_id as string,
      title: title ?? "Untitled record",
    };
  });

  return {
    id: file.id as string,
    fileName: file.file_name as string,
    caption: (file.caption as string | null) ?? null,
    projectId: (file.project_id as string | null) ?? null,
    sizeBytes: (file.size_bytes as number | null) ?? null,
    createdAt: file.created_at as string,
    linkedRecords,
  };
}
