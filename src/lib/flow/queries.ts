/**
 * Read-only display queries for the guided-flow wizard page (MVP 2 Phase 4 follow-up). These only
 * READ — the heading's file name and whether the linked interview sub-session has completed — so
 * the page can render without re-running any agent. All orchestration mutations go through the
 * tested Server Actions in src/lib/orchestrator/actions.ts; nothing here writes or reasons (AC1).
 * RLS scopes every table to the signed-in owner.
 */
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type FlowRunMeta = {
  fileId: string;
  fileName: string;
  /** The interview step's sub-FSM owns its own completion; true once its session is `complete`. */
  interviewComplete: boolean;
  /**
   * The record the review step reviews — the newest record the propose step linked to this file —
   * so the review panel rehydrates on reopen (when `advanceRun`'s proposal payload isn't in hand).
   * Mirrors the orchestrator's own `linkedRecordIds(fileId)[0]`. Null until a record exists.
   */
  reviewRecordId: string | null;
};

/**
 * Resolve the display metadata for one run: the anchored file's name and whether the linked
 * interview session (if any) has reached `complete`. Returns null when the run is not the user's.
 */
export async function getFlowRunMeta(
  supabase: ServerClient,
  runId: string
): Promise<FlowRunMeta | null> {
  const { data: run } = await supabase
    .from("orchestration_runs")
    .select("file_id, interview_session_id")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return null;
  const fileId = run.file_id as string;

  const { data: file } = await supabase
    .from("files")
    .select("file_name")
    .eq("id", fileId)
    .maybeSingle();

  let interviewComplete = false;
  const sessionId = run.interview_session_id as string | null;
  if (sessionId) {
    const { data: session } = await supabase
      .from("interview_sessions")
      .select("status")
      .eq("id", sessionId)
      .maybeSingle();
    interviewComplete =
      (session as { status?: string } | null)?.status === "complete";
  }

  const { data: links } = await supabase
    .from("evidence_links")
    .select("decision_record_id, created_at")
    .eq("file_id", fileId)
    .not("decision_record_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const reviewRecordId =
    ((links ?? [])[0] as { decision_record_id?: string } | undefined)
      ?.decision_record_id ?? null;

  return {
    fileId,
    fileName: (file as { file_name?: string } | null)?.file_name ?? "your file",
    interviewComplete,
    reviewRecordId,
  };
}
