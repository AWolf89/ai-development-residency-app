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
import {
  rankOccupationSuggestions,
  type OccupationSuggestion,
  type OccupationAttribute,
} from "./occupation";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** How many raw occupation rows to fetch before ranking/capping. */
const OCCUPATION_FETCH_LIMIT = 50;

/** Shortest prefix we run an occupation search for. */
export const MIN_OCCUPATION_PREFIX = 2;

/**
 * Title-path autosuggest: occupations whose name contains the typed prefix,
 * ranked prefix-first by the pure helper. Humble SDK wrapper — the ordering logic
 * is tested in occupation.test.ts. Reference data is read-only to all users.
 */
export async function searchOccupations(
  supabase: ServerClient,
  prefix: string
): Promise<OccupationSuggestion[]> {
  // Strip LIKE metacharacters (match quirks only, not a security issue — supabase
  // parameterises the value) and require a minimum length.
  const term = prefix
    .trim()
    .replace(/[%_\\]/g, " ")
    .trim();
  if (term.length < MIN_OCCUPATION_PREFIX) {
    return [];
  }
  const { data, error } = await supabase
    .from("reference_items")
    .select("id, name, external_id")
    .eq("source", "onet")
    .eq("entity_type", "occupation")
    .ilike("name", `%${term}%`)
    .limit(OCCUPATION_FETCH_LIMIT);
  if (error) {
    throw new Error(error.message);
  }
  const candidates = (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    code: r.external_id as string,
  }));
  return rankOccupationSuggestions(term, candidates);
}

/**
 * The importance-rated skill and knowledge attributes of one occupation, by its
 * SOC code. Only the Importance (IM) scale rows are fetched; `buildRequirements-
 * FromOccupation` ranks and trims them. Humble SDK wrapper.
 */
export async function getOccupationAttributes(
  supabase: ServerClient,
  code: string
): Promise<OccupationAttribute[]> {
  const soc = code.trim().replace(/[%_\\]/g, "");
  if (soc.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("reference_items")
    .select("name, payload")
    .eq("source", "onet")
    .in("entity_type", ["occupation_skill", "occupation_knowledge"])
    .like("external_id", `${soc}:%`)
    .eq("payload->>scale_id", "IM");
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => {
    const payload = (r.payload ?? {}) as Record<string, unknown>;
    return {
      name: (r.name as string) ?? "",
      importance: Number(payload.data_value) || 0,
    };
  });
}

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
