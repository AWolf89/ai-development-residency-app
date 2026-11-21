/**
 * Thin, read-only data access for interview sessions and turns (ADR-0014).
 *
 * A humble query wrapper used by the orchestrator (to rehydrate the FSM) and the interview
 * Server Component. RLS guarantees it only returns the signed-in user's own rows (own-rows
 * policy), so it takes an authenticated server client. No business logic lives here — mapping
 * rows to FSM state is the orchestrator's job (Humble Object, CLAUDE.md §3).
 */
import type { createClient } from "@/lib/supabase/server";
import type { CdmDraft, GroundingCitation } from "./types";
import type { Timeline } from "./timeline";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type InterviewSessionRow = {
  id: string;
  user_id: string;
  title: string;
  target_role_id: string | null;
  // The project whose files seeded the timeline, or null for the non-timeline flow (ADR-0021).
  project_id: string | null;
  // The user-confirmed timeline, or null until confirmed (ADR-0021).
  timeline: Timeline | null;
  status: "active" | "paused" | "complete";
  question_budget: number;
  asked_count: number;
  created_at: string;
  updated_at: string;
};

export type InterviewTurnRow = {
  id: string;
  session_id: string;
  user_id: string;
  question_text: string;
  grounding_citation: GroundingCitation | null;
  answer_text: string | null;
  paraphrase: CdmDraft | null;
  status: "asked" | "answered" | "skipped" | "saved";
  decision_record_id: string | null;
  created_at: string;
};

const SESSION_COLS =
  "id, user_id, title, target_role_id, project_id, timeline, status, question_budget, asked_count, created_at, updated_at";
const TURN_COLS =
  "id, session_id, user_id, question_text, grounding_citation, answer_text, paraphrase, status, decision_record_id, created_at";

/** One interview session by id (RLS-scoped to the owner), or null if not found. */
export async function getInterviewSession(
  supabase: ServerClient,
  sessionId: string
): Promise<InterviewSessionRow | null> {
  const { data } = await supabase
    .from("interview_sessions")
    .select(SESSION_COLS)
    .eq("id", sessionId)
    .maybeSingle();
  return (data as InterviewSessionRow | null) ?? null;
}

/** The user's most recent session (newest first), or null — used to resume or show status. */
export async function getLatestInterviewSession(
  supabase: ServerClient
): Promise<InterviewSessionRow | null> {
  const { data } = await supabase
    .from("interview_sessions")
    .select(SESSION_COLS)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as InterviewSessionRow | null) ?? null;
}

/** The turns of one session in order (oldest first) — the interview history. */
export async function getTurnsForSession(
  supabase: ServerClient,
  sessionId: string
): Promise<InterviewTurnRow[]> {
  const { data } = await supabase
    .from("interview_turns")
    .select(TURN_COLS)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return (data ?? []) as InterviewTurnRow[];
}
