import type { createClient } from "@/lib/supabase/server";

/**
 * Thin, read-only data access for a user's saved file tags (ADR-0020). A humble query wrapper
 * used by the Files page (Server Component). RLS on file_reference_tags scopes the rows to the
 * signed-in owner; reference_items is shared read-only, joined here for the display name.
 */
type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type FileTagView = {
  fileId: string;
  name: string;
  entityType: string;
  confidence: string;
};

type TagRow = {
  file_id: string;
  entity_type: string;
  confidence: string;
  reference_items: { name: string } | { name: string }[] | null;
};

/** The saved tags for all of a user's files, grouped by file id (RLS-scoped to the owner). */
export async function getFileTagsByFile(
  supabase: ServerClient
): Promise<Record<string, FileTagView[]>> {
  const { data } = await supabase
    .from("file_reference_tags")
    .select("file_id, entity_type, confidence, reference_items ( name )");

  const byFile: Record<string, FileTagView[]> = {};
  for (const row of (data ?? []) as TagRow[]) {
    // A to-one embed can arrive as an object or a one-element array depending on the client.
    const ref = Array.isArray(row.reference_items)
      ? row.reference_items[0]
      : row.reference_items;
    const name = ref?.name;
    if (!name) continue;
    (byFile[row.file_id] ??= []).push({
      fileId: row.file_id,
      name,
      entityType: row.entity_type,
      confidence: row.confidence,
    });
  }
  return byFile;
}

/** The ids of files the batch flagged as needing interactive review (RLS-scoped to the owner). */
export async function getNeedsReviewFileIds(
  supabase: ServerClient
): Promise<Set<string>> {
  const { data } = await supabase
    .from("files")
    .select("id")
    .eq("analysis_status", "needs_review");
  return new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
}
