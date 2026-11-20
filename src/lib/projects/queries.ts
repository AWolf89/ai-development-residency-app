/**
 * Thin, read-only data access for a user's projects (ADR-0019).
 *
 * Humble query wrappers (no business logic) used by the Server Components. RLS
 * guarantees only the signed-in user's own rows come back, which is why these
 * take an already-authenticated server client. The aggregation shaping lives in
 * the pure `assembleProjectDetail` (tested with canned rows).
 */
import type { createClient } from "@/lib/supabase/server";
import type { ProjectRow } from "./mappers";
import { assembleProjectDetail, type ProjectDetail } from "./detail";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const PROJECT_COLUMNS =
  "id, name, role, organisation, summary, status, started_on, ended_on, created_at";

/** All of the signed-in user's projects, newest first. */
export async function getProjects(
  supabase: ServerClient,
  userId: string
): Promise<ProjectRow[]> {
  const { data } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (data ?? []) as ProjectRow[];
}

/** One project the user owns, or null. */
export async function getProject(
  supabase: ServerClient,
  userId: string,
  id: string
): Promise<ProjectRow | null> {
  const { data } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  return (data as ProjectRow | null) ?? null;
}

/**
 * A project plus its three linked evidence groups. Returns null when the project
 * is not found / not owned. The three selects are RLS-scoped; the shaping is the
 * pure `assembleProjectDetail`.
 */
export async function getProjectWithLinks(
  supabase: ServerClient,
  userId: string,
  id: string
): Promise<ProjectDetail | null> {
  const project = await getProject(supabase, userId, id);
  if (!project) {
    return null;
  }

  const [files, records, moments] = await Promise.all([
    supabase
      .from("files")
      .select("id, file_name, caption")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("decision_records")
      .select("id, title")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("learning_moments")
      .select("id, kind")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return assembleProjectDetail({
    project,
    files: (files.data ?? []) as { id: string; file_name: string; caption: string | null }[],
    records: (records.data ?? []) as { id: string; title: string }[],
    moments: (moments.data ?? []) as { id: string; kind: string }[],
  });
}
