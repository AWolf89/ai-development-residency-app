/**
 * Thin, read-only data access for target roles and their requirements.
 *
 * Humble query wrappers used by Server Components. RLS guarantees each query only
 * returns the signed-in user's own rows (AC11), so they take an authenticated
 * server client.
 */
import type { createClient } from "@/lib/supabase/server";
import type { SourceLabel } from "./source";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type TargetRoleListItem = {
  id: string;
  title: string;
  company: string | null;
  job_description: string | null;
  created_at: string;
};

export type RoleRequirementItem = {
  id: string;
  target_role_id: string;
  requirement_text: string;
  source: SourceLabel | null;
  reference_item_id: string | null;
};

/** The signed-in user's target roles, newest first (AC4). */
export async function getTargetRoles(
  supabase: ServerClient,
  userId: string
): Promise<TargetRoleListItem[]> {
  const { data } = await supabase
    .from("target_roles")
    .select("id, title, company, job_description, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as TargetRoleListItem[];
}

/** One target role by id (RLS scopes it to the owner). */
export async function getTargetRoleById(
  supabase: ServerClient,
  id: string
): Promise<TargetRoleListItem | null> {
  const { data } = await supabase
    .from("target_roles")
    .select("id, title, company, job_description, created_at")
    .eq("id", id)
    .maybeSingle();
  return (data as TargetRoleListItem | null) ?? null;
}

/** The requirements for one or more target roles (RLS-scoped to the owner). */
export async function getRequirementsForRoles(
  supabase: ServerClient,
  targetRoleIds: string[]
): Promise<RoleRequirementItem[]> {
  if (targetRoleIds.length === 0) {
    return [];
  }
  const { data } = await supabase
    .from("role_requirements")
    .select("id, target_role_id, requirement_text, source, reference_item_id")
    .in("target_role_id", targetRoleIds)
    .order("created_at", { ascending: true });
  return (data ?? []) as RoleRequirementItem[];
}
