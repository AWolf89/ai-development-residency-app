/**
 * Supabase-backed implementation of TargetRoleRepository.
 *
 * Thin "humble" adapter: SDK calls only, no business logic (that lives in save.ts
 * and the pure modules). Mutations throw on error (command/query separation). RLS
 * on target_roles, role_requirements and reference_items enforces per-user access
 * (AC11) and read-only reference data.
 */
import type { createClient } from "@/lib/supabase/server";
import type { TargetRoleRepository } from "./save";
import type { TargetRoleRow, RoleRequirementRow } from "./mappers";
import type { FrameworkItem } from "./matching";
import { pickOnetSearchTerm } from "./matching";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export function createSupabaseTargetRoleRepository(
  supabase: ServerClient
): TargetRoleRepository {
  return {
    async getFrameworkItems(): Promise<FrameworkItem[]> {
      const { data, error } = await supabase
        .from("reference_items")
        .select("id, name")
        .eq("source", "techfleet-spf");
      if (error) {
        throw new Error(error.message);
      }
      return (data ?? []) as FrameworkItem[];
    },

    async searchOnet(requirement: string) {
      const term = pickOnetSearchTerm(requirement);
      if (!term) {
        return null;
      }
      // ILIKE is accelerated by the pg_trgm GIN index on reference_items.name.
      const { data, error } = await supabase
        .from("reference_items")
        .select("id")
        .eq("source", "onet")
        .ilike("name", `%${term}%`)
        .limit(1);
      if (error) {
        throw new Error(error.message);
      }
      return data && data[0] ? { id: data[0].id as string } : null;
    },

    async insertTargetRole(row: TargetRoleRow) {
      const { data, error } = await supabase
        .from("target_roles")
        .insert(row)
        .select("id")
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return { id: data.id as string };
    },

    async updateTargetRole(id: string, row: TargetRoleRow) {
      const { error } = await supabase
        .from("target_roles")
        .update(row)
        .eq("id", id);
      if (error) {
        throw new Error(error.message);
      }
    },

    async replaceRequirements(
      targetRoleId: string,
      userId: string,
      rows: RoleRequirementRow[]
    ) {
      // Replace, so editing never leaves stale/duplicate requirements. RLS scopes
      // the delete to the user's own rows.
      const { error: deleteError } = await supabase
        .from("role_requirements")
        .delete()
        .eq("target_role_id", targetRoleId);
      if (deleteError) {
        throw new Error(deleteError.message);
      }
      if (rows.length > 0) {
        const { error } = await supabase.from("role_requirements").insert(rows);
        if (error) {
          throw new Error(error.message);
        }
      }
      void userId; // ownership is enforced by RLS; kept for interface symmetry
    },
  };
}
