/**
 * Thin, read-only data access for decision records and a user's files.
 *
 * These are humble query wrappers (no business logic) used by Server Components.
 * Row-Level Security guarantees each query only ever returns the signed-in
 * user's own rows (AC7), which is also why they take an already-authenticated
 * server client.
 */
import type { createClient } from "@/lib/supabase/server";
import type { DecisionSource } from "./validation";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type DecisionRecordListItem = {
  id: string;
  title: string;
  situation: string | null;
  cue: string | null;
  decision: string | null;
  why: string | null;
  outcome: string | null;
  source: DecisionSource | null;
  created_at: string;
};

export type UserFile = {
  id: string;
  file_name: string;
};

const RECORD_COLUMNS =
  "id, title, situation, cue, decision, why, outcome, source, created_at";

/** All of the signed-in user's decision records, newest first (AC5). */
export async function getDecisionRecords(
  supabase: ServerClient,
  userId: string
): Promise<DecisionRecordListItem[]> {
  const { data } = await supabase
    .from("decision_records")
    .select(RECORD_COLUMNS)
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .order("created_at", { ascending: false });

  return (data ?? []) as DecisionRecordListItem[];
}

/** One decision record by id (RLS scopes it to the owner). */
export async function getDecisionRecordById(
  supabase: ServerClient,
  id: string
): Promise<DecisionRecordListItem | null> {
  const { data } = await supabase
    .from("decision_records")
    .select(RECORD_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  return (data as DecisionRecordListItem | null) ?? null;
}

/** The file currently linked to a record, if any (for the edit form). */
export async function getLinkedFileId(
  supabase: ServerClient,
  decisionRecordId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("evidence_links")
    .select("file_id")
    .eq("decision_record_id", decisionRecordId)
    .maybeSingle();

  return (data?.file_id as string | null) ?? null;
}

/** The signed-in user's uploaded files, for the supporting-artifact picker. */
export async function getUserFiles(
  supabase: ServerClient,
  userId: string
): Promise<UserFile[]> {
  const { data } = await supabase
    .from("files")
    .select("id, file_name")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (data ?? []) as UserFile[];
}
