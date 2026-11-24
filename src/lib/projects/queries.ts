/**
 * Thin, read-only data access for a user's projects (ADR-0019).
 *
 * Humble query wrappers (no business logic) used by the Server Components. RLS
 * guarantees only the signed-in user's own rows come back, which is why these
 * take an already-authenticated server client. The aggregation shaping lives in
 * the pure `assembleProjectDetail` (tested with canned rows).
 */
import type { createClient } from "@/lib/supabase/server";
import { getClaims } from "@/lib/claims/queries";
import type { ClaimLifecycleState } from "@/lib/claims/lifecycle";
import {
  mapProjectRowToView,
  type ProjectRow,
  type ProjectView,
} from "./mappers";
import { assembleProjectDetail, type ProjectDetail } from "./detail";
import { assembleProjectHub, type ProjectHub } from "./hub";

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

/** One project card's data for the list: the project plus its claim lifecycles and source count. */
export type ProjectOverview = {
  project: ProjectView;
  claimLifecycles: ClaimLifecycleState[];
  sourceCount: number;
};

/**
 * The Projects list (plan §6.2; Figma "Projects"): every project with the claim lifecycles and
 * linked-file count its health card needs. A read-only aggregation — claims map to a project
 * through their backing decision record's `project_id` (a claim's `id` is that record's id,
 * ADR-0022). All selects are RLS-scoped to the owner (AC4); the pure `computeProjectHealth`
 * turns each `claimLifecycles` into the bar and counts.
 */
export async function getProjectsOverview(
  supabase: ServerClient,
  userId: string
): Promise<ProjectOverview[]> {
  const [projectRows, claims, recordRows, fileRows] = await Promise.all([
    getProjects(supabase, userId),
    getClaims(supabase, userId),
    supabase
      .from("decision_records")
      .select("id, project_id")
      .eq("user_id", userId),
    supabase.from("files").select("project_id").eq("user_id", userId),
  ]);

  // record id -> project id (claims hang off their backing decision record).
  const recordToProject = new Map<string, string>();
  for (const row of (recordRows.data ?? []) as {
    id: string;
    project_id: string | null;
  }[]) {
    if (row.project_id) {
      recordToProject.set(row.id, row.project_id);
    }
  }

  const lifecyclesByProject = new Map<string, ClaimLifecycleState[]>();
  for (const claim of claims) {
    const projectId = recordToProject.get(claim.id);
    if (!projectId) {
      continue;
    }
    const list = lifecyclesByProject.get(projectId) ?? [];
    list.push(claim.lifecycle);
    lifecyclesByProject.set(projectId, list);
  }

  const sourcesByProject = new Map<string, number>();
  for (const row of (fileRows.data ?? []) as { project_id: string | null }[]) {
    if (row.project_id) {
      sourcesByProject.set(
        row.project_id,
        (sourcesByProject.get(row.project_id) ?? 0) + 1
      );
    }
  }

  return projectRows.map((row) => ({
    project: mapProjectRowToView(row),
    claimLifecycles: lifecyclesByProject.get(row.id) ?? [],
    sourceCount: sourcesByProject.get(row.id) ?? 0,
  }));
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
    files: (files.data ?? []) as {
      id: string;
      file_name: string;
      caption: string | null;
    }[],
    records: (records.data ?? []) as { id: string; title: string }[],
    moments: (moments.data ?? []) as { id: string; kind: string }[],
  });
}

/**
 * The Project Workspace hub (plan §6.2; Figma detail frame): a project plus everything linked to
 * it — files, decision records (with their decision/outcome/category), learning moments, and the
 * claims that project over those records (ADR-0022). Returns null when the project is not owned.
 * All selects are RLS-scoped (AC4); the pure `assembleProjectHub` shapes the sections.
 */
export async function getProjectHub(
  supabase: ServerClient,
  userId: string,
  id: string
): Promise<ProjectHub | null> {
  const project = await getProject(supabase, userId, id);
  if (!project) {
    return null;
  }

  const [files, records, moments, claims] = await Promise.all([
    supabase
      .from("files")
      .select("id, file_name, caption")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("decision_records")
      .select("id, title, decision, outcome, category")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("learning_moments")
      .select("id, kind")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    getClaims(supabase, userId),
  ]);

  const recordRows = (records.data ?? []) as {
    id: string;
    title: string;
    decision: string | null;
    outcome: string | null;
    category: string | null;
  }[];

  // Claims hang off their backing decision record (a claim's id is that record's id). Keep only
  // the claims whose record belongs to this project.
  const recordIds = new Set(recordRows.map((r) => r.id));
  const hubClaims = claims
    .filter((c) => recordIds.has(c.id))
    .map((c) => ({ id: c.id, title: c.title, lifecycle: c.lifecycle }));

  return assembleProjectHub({
    project: mapProjectRowToView(project),
    files: (files.data ?? []) as {
      id: string;
      file_name: string;
      caption: string | null;
    }[],
    records: recordRows,
    moments: (moments.data ?? []) as { id: string; kind: string }[],
    claims: hubClaims,
  });
}
