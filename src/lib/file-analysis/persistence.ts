import "server-only";
import { createClient } from "@/lib/supabase/server";
import { indexEvidenceForCurrentUser } from "@/lib/rag/evidence-index";
import { toTagRow, buildIndexedText } from "./analyze";
import type { ProposedTag } from "./types";

// Persistence for an accepted File Analysis (Humble Object, ADR-0020). The HITL save: it runs only
// on an explicit accept (the FSM guarantees `saving` is reachable only from `awaiting_review`), and
// it does two things atomically-enough for one user's own rows: (1) replace this file's tags, and
// (2) re-index the file's evidence as text + enrichment so the Gap Check retrieves and cites it.
// RLS scopes every write to the owner.

async function currentUserId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string> {
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId)
    throw new Error("Saving file analysis requires a signed-in user.");
  return userId;
}

/**
 * Save the accepted tags for a file and fold the summary + tags into its evidence index.
 * Replace semantics: the accepted set becomes the file's current tags, and the re-index uses the
 * cached file_text (populated by resolveFileText) so no model call runs here.
 */
export async function saveFileAnalysis(params: {
  fileId: string;
  summary: string;
  tags: ProposedTag[];
}): Promise<void> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);

  // 1) Replace this file's tags with the accepted set.
  const del = await supabase
    .from("file_reference_tags")
    .delete()
    .eq("file_id", params.fileId);
  if (del.error) {
    throw new Error(`clearing file tags failed: ${del.error.message}`);
  }
  if (params.tags.length > 0) {
    const rows = params.tags.map((tag) =>
      toTagRow(tag, { userId, fileId: params.fileId })
    );
    const ins = await supabase.from("file_reference_tags").insert(rows);
    if (ins.error) {
      throw new Error(`saving file tags failed: ${ins.error.message}`);
    }
  }

  // 2) Re-index the file's evidence (cached text + enrichment) so the Gap Check uses it.
  const { data: ft } = await supabase
    .from("file_text")
    .select("content")
    .eq("file_id", params.fileId)
    .maybeSingle();
  const { data: file } = await supabase
    .from("files")
    .select("file_name")
    .eq("id", params.fileId)
    .maybeSingle();

  const indexText = buildIndexedText(
    (ft?.content as string) ?? "",
    params.summary,
    params.tags
  );
  // indexEvidenceForCurrentUser replaces the file's chunks (and clears them when text is empty).
  await indexEvidenceForCurrentUser(indexText, {
    source_kind: "file",
    file_id: params.fileId,
    title: (file?.file_name as string) ?? "",
  });
}
