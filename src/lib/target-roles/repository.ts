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
  rankFrameworkRoles,
  rankSpecializations,
  extractFrameworkRoleSkills,
  extractSpecializationRequirements,
  parseRoleAliases,
  parseRelatedRoleSlugs,
  parseSpecializationAliases,
  type OccupationSuggestion,
  type OccupationAttribute,
  type FrameworkRoleCandidate,
  type SpecializationCandidate,
} from "./occupation";

const FRAMEWORK_SOURCE = "techfleet-spf";
const JOB_FUNCTION_ENTITY = "job-functions";
const SPECIALIZATION_ENTITY = "specializations";

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
  const candidates: OccupationSuggestion[] = (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    code: r.external_id as string,
    source: "onet",
  }));
  return rankOccupationSuggestions(term, candidates);
}

/**
 * Title-path autosuggest over the Skills & Practices Framework job-functions
 * (UX Designer, Product Manager, …). There are only a handful, so we fetch them
 * all and match name + aliases in memory via the pure `rankFrameworkRoles`.
 */
export async function searchFrameworkRoles(
  supabase: ServerClient,
  prefix: string
): Promise<OccupationSuggestion[]> {
  const term = prefix.trim();
  if (term.length < MIN_OCCUPATION_PREFIX) {
    return [];
  }
  const { data, error } = await supabase
    .from("reference_items")
    .select("id, name, external_id, payload")
    .eq("source", FRAMEWORK_SOURCE)
    .eq("entity_type", JOB_FUNCTION_ENTITY);
  if (error) {
    throw new Error(error.message);
  }
  const roles: FrameworkRoleCandidate[] = (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    code: r.external_id as string,
    aliases: parseRoleAliases((r.payload ?? {}) as Record<string, unknown>),
  }));
  return rankFrameworkRoles(term, roles);
}

/**
 * Title-path autosuggest over the Skills & Practices Framework specializations
 * (Qualitative UX Research, Growth Product Management, …). Like job-functions
 * there are only a couple dozen, so we fetch them all and match name + aliases in
 * memory via the pure `rankSpecializations` (tagged source="specialization").
 */
export async function searchSpecializations(
  supabase: ServerClient,
  prefix: string
): Promise<OccupationSuggestion[]> {
  const term = prefix.trim();
  if (term.length < MIN_OCCUPATION_PREFIX) {
    return [];
  }
  const { data, error } = await supabase
    .from("reference_items")
    .select("id, name, external_id, payload")
    .eq("source", FRAMEWORK_SOURCE)
    .eq("entity_type", SPECIALIZATION_ENTITY);
  if (error) {
    throw new Error(error.message);
  }
  const specializations: SpecializationCandidate[] = (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    code: r.external_id as string,
    aliases: parseSpecializationAliases(
      (r.payload ?? {}) as Record<string, unknown>
    ),
  }));
  return rankSpecializations(term, specializations);
}

/**
 * Merged title suggestions: Framework job-functions and specializations first
 * (the curated, tech-relevant titles — both shown with the "Framework" tag), then
 * O*NET occupations, capped. Framework-first because this is a tech-career app,
 * and those titles (and their aliases) are what users look for.
 */
export async function searchRoleTitles(
  supabase: ServerClient,
  prefix: string
): Promise<OccupationSuggestion[]> {
  const [framework, specializations, onet] = await Promise.all([
    searchFrameworkRoles(supabase, prefix),
    searchSpecializations(supabase, prefix),
    searchOccupations(supabase, prefix),
  ]);
  return [...framework, ...specializations, ...onet].slice(0, 10);
}

/**
 * The curated skills of a Framework job-function, by its slug — used to derive
 * requirements when a Framework role is picked. The ranking/extraction logic is
 * tested in occupation.test.ts.
 */
export async function getFrameworkRoleSkills(
  supabase: ServerClient,
  slug: string
): Promise<string[]> {
  const value = slug.trim();
  if (value.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("reference_items")
    .select("payload")
    .eq("source", FRAMEWORK_SOURCE)
    .eq("entity_type", JOB_FUNCTION_ENTITY)
    .eq("external_id", value)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return [];
  }
  return extractFrameworkRoleSkills(
    (data.payload ?? {}) as Record<string, unknown>
  );
}

/**
 * The derived requirements of a Framework specialization, by its slug: its own
 * tasks first, then the curated skills of its related job-functions (walked via
 * the payload's related-position slugs). The combining/ranking logic is pure and
 * tested in occupation.test.ts; this wrapper only fetches. Returns [] for an
 * unknown slug or one with no derivable data.
 */
export async function getSpecializationRequirements(
  supabase: ServerClient,
  slug: string
): Promise<string[]> {
  const value = slug.trim();
  if (value.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("reference_items")
    .select("payload")
    .eq("source", FRAMEWORK_SOURCE)
    .eq("entity_type", SPECIALIZATION_ENTITY)
    .eq("external_id", value)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return [];
  }
  const payload = (data.payload ?? {}) as Record<string, unknown>;

  // Borrow the related job-functions' curated skills to flesh out thin
  // specializations (e.g. Sprint Master → Agile Coach).
  const relatedSlugs = parseRelatedRoleSlugs(payload);
  let relatedRoleSkills: string[] = [];
  if (relatedSlugs.length > 0) {
    const { data: related, error: relatedError } = await supabase
      .from("reference_items")
      .select("payload")
      .eq("source", FRAMEWORK_SOURCE)
      .eq("entity_type", JOB_FUNCTION_ENTITY)
      .in("external_id", relatedSlugs);
    if (relatedError) {
      throw new Error(relatedError.message);
    }
    relatedRoleSkills = (related ?? []).flatMap((r) =>
      extractFrameworkRoleSkills((r.payload ?? {}) as Record<string, unknown>)
    );
  }

  return extractSpecializationRequirements(payload, relatedRoleSkills);
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

    async deleteTargetRole(id: string) {
      // RLS scopes the delete to the owner's row; role_requirements and
      // requirement_gap_assessments cascade (FK on delete cascade). A non-owner
      // or missing id simply deletes nothing.
      const { error } = await supabase
        .from("target_roles")
        .delete()
        .eq("id", id);
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}
