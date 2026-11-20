import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseFileRepository } from "@/lib/files/repository";
import { extractText, defaultParsers } from "@/lib/files/extract";
import { describeImage } from "@/lib/files/describe-image";
import { analyzeFileText } from "./classifier";
import { batchDecision } from "./analyze";
import { saveFileAnalysis } from "./persistence";
import type { AnalysisPassResult } from "./pass";

// The File Analysis orchestrator (Humble Object, ADR-0020). It performs the IO around the pure
// analysis pass: resolve a file's text (reading images with the vision pass), persist that text,
// and run one grounded analysis pass. It holds no control-flow logic — the FSM (machine.ts) and
// the grounding (pass.ts / analyze.ts) do — so it stays a thin boundary. RLS scopes every query
// to the signed-in owner.

async function currentUserId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string> {
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new Error("File analysis requires a signed-in user.");
  return userId;
}

export type ResolvedFile = {
  fileName: string;
  mimeType: string;
  text: string;
};

/**
 * Resolve a file's analyzable text: download the bytes and extract text, running the vision pass
 * for images so a journey-map screenshot becomes searchable text. The result is cached in
 * `file_text` so a later accept (re-index) and re-analysis don't re-run the model. RLS: a file the
 * caller does not own comes back as "not found".
 */
export async function resolveFileText(fileId: string): Promise<ResolvedFile> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);

  const { data: file, error } = await supabase
    .from("files")
    .select("id, file_name, mime_type, storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (error) throw new Error(`loading file failed: ${error.message}`);
  if (!file) throw new Error("File not found.");

  const repo = createSupabaseFileRepository(supabase);
  const bytes = await repo.downloadObject(file.storage_path as string);
  const text = await extractText(bytes, (file.mime_type as string) ?? "", {
    ...defaultParsers,
    image: (b, mimeType) =>
      describeImage(b, mimeType, file.file_name as string),
  });

  // Cache the extracted text (replace any prior row) so accept/re-analysis reuse it.
  await supabase.from("file_text").delete().eq("file_id", fileId);
  if (text) {
    await supabase
      .from("file_text")
      .insert({ user_id: userId, file_id: fileId, content: text });
  }

  return {
    fileName: file.file_name as string,
    mimeType: (file.mime_type as string) ?? "",
    text,
  };
}

export type FileAnalysisResult = AnalysisPassResult & {
  fileName: string;
  fileText: string;
};

/**
 * Run one analysis pass for a file: resolve its text (vision for images), then analyze it against
 * the grounded candidate set. `priorAnswers` carries the user's clarification answers on a re-run.
 */
export async function analyzeFile(
  fileId: string,
  priorAnswers?: { question: string; answer: string }[]
): Promise<FileAnalysisResult> {
  const { fileName, text } = await resolveFileText(fileId);
  const pass = await analyzeFileText(text, priorAnswers);
  return { ...pass, fileName, fileText: text };
}

export type BatchSummary = {
  processed: number;
  autoTagged: number;
  needsReview: number;
  failed: number;
};

/**
 * Batch "Analyze all" (ADR-0020): analyze every not-yet-analyzed file non-interactively. A file
 * whose result is confident gets its high-confidence tags applied; an ambiguous one is marked
 * `needs_review` for the user to open individually — the batch never guesses and never asks. Each
 * file is best-effort: one failure is counted and the sweep continues. Bounded and sequential
 * (one model pass per file), on the user's explicit action — not an auto-run.
 */
export async function analyzeAllForCurrentUser(): Promise<BatchSummary> {
  const supabase = await createClient();
  await currentUserId(supabase); // ensure signed in (RLS scopes the rest)

  // Only files not yet analyzed (null status); RLS limits this to the owner's files.
  const { data, error } = await supabase
    .from("files")
    .select("id")
    .is("analysis_status", null);
  if (error) throw new Error(`listing files failed: ${error.message}`);

  const summary: BatchSummary = {
    processed: 0,
    autoTagged: 0,
    needsReview: 0,
    failed: 0,
  };

  for (const row of (data ?? []) as { id: string }[]) {
    try {
      const result = await analyzeFile(row.id);
      const decision = batchDecision(result.tags, result.questions.length);
      if (decision.status === "needs_review") {
        await supabase
          .from("files")
          .update({ analysis_status: "needs_review" })
          .eq("id", row.id);
        summary.needsReview += 1;
      } else {
        // saveFileAnalysis applies the tags, re-indexes, and marks the file reviewed.
        await saveFileAnalysis({
          fileId: row.id,
          summary: result.summary,
          tags: decision.tagsToApply,
        });
        if (decision.tagsToApply.length > 0) summary.autoTagged += 1;
      }
      summary.processed += 1;
    } catch (err) {
      console.error(`batch analysis failed for file ${row.id}`, err);
      summary.failed += 1;
    }
  }

  return summary;
}
