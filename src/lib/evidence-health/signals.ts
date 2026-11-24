import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getClaims } from "@/lib/claims/queries";
import { isActiveLifecycle } from "@/lib/claims/lifecycle";
import { collectSignals } from "@/lib/investigations/signals";
import { buildQueue } from "@/lib/investigations/build";
import { getProjects } from "@/lib/projects/queries";
import {
  getTargetRoles,
  getRequirementsForRoles,
} from "@/lib/target-roles/queries";
import { getAssessmentsForRole } from "@/lib/gap/queries";
import type { HealthInputs, RoleCoverageInput } from "./types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Collect the Evidence-health inputs (MVP 2 Phase 3, plan §6.6). A read-only projection: it
 * reuses the existing queries — claim lifecycle, the investigation signals, projects, and gap
 * assessments — and leaves all shaping to the pure `buildHealth`. Row-Level Security scopes every
 * read to the signed-in owner (AC4). No writes.
 */
export async function collectHealthInputs(
  supabase: ServerClient,
  userId: string
): Promise<HealthInputs> {
  const [claimLifecycles, investigationCount, projectsNeedingEvidence, roles] =
    await Promise.all([
      getClaimLifecycles(supabase, userId),
      getInvestigationCount(supabase, userId),
      getProjectsNeedingEvidence(supabase, userId),
      getRoleCoverage(supabase, userId),
    ]);

  return {
    claimLifecycles,
    investigationCount,
    projectsNeedingEvidence,
    roles,
  };
}

/** The lifecycle of every active (non-archived) claim. */
async function getClaimLifecycles(supabase: ServerClient, userId: string) {
  const claims = await getClaims(supabase, userId);
  return claims.map((c) => c.lifecycle).filter((l) => isActiveLifecycle(l));
}

/** Size of the Investigation Queue — reuses the investigations projection, so the two never drift. */
async function getInvestigationCount(supabase: ServerClient, userId: string) {
  const signals = await collectSignals(supabase, userId);
  return buildQueue(signals).length;
}

/**
 * Projects with nothing linked to them yet. A project is "needing evidence" when its id appears in
 * none of files / decision_records / learning_moments. Each select is RLS-scoped to the owner.
 */
async function getProjectsNeedingEvidence(
  supabase: ServerClient,
  userId: string
): Promise<number> {
  const projects = await getProjects(supabase, userId);
  if (projects.length === 0) {
    return 0;
  }

  const [files, records, moments] = await Promise.all([
    supabase.from("files").select("project_id").eq("user_id", userId),
    supabase
      .from("decision_records")
      .select("project_id")
      .eq("user_id", userId),
    supabase
      .from("learning_moments")
      .select("project_id")
      .eq("user_id", userId),
  ]);

  const linked = new Set<string>();
  for (const rows of [files.data, records.data, moments.data]) {
    for (const row of rows ?? []) {
      const projectId = (row as { project_id: string | null }).project_id;
      if (projectId) {
        linked.add(projectId);
      }
    }
  }

  return projects.filter((p) => !linked.has(p.id)).length;
}

/** Per-role coverage: requirements with a met/partial verdict, over the role's total requirements. */
async function getRoleCoverage(
  supabase: ServerClient,
  userId: string
): Promise<RoleCoverageInput[]> {
  const roles = await getTargetRoles(supabase, userId);
  if (roles.length === 0) {
    return [];
  }

  const requirements = await getRequirementsForRoles(
    supabase,
    roles.map((r) => r.id)
  );
  const totalByRole = new Map<string, number>();
  for (const req of requirements) {
    totalByRole.set(
      req.target_role_id,
      (totalByRole.get(req.target_role_id) ?? 0) + 1
    );
  }

  const assessmentLists = await Promise.all(
    roles.map((r) => getAssessmentsForRole(supabase, r.id))
  );

  return roles.map((role, i) => {
    const assessments = assessmentLists[i];
    const supported = assessments.filter(
      (a) => a.verdict === "met" || a.verdict === "partial"
    ).length;
    return {
      roleId: role.id,
      title: role.title,
      supported,
      total: totalByRole.get(role.id) ?? 0,
      assessed: assessments.length,
    };
  });
}
