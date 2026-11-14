/**
 * Pure logic for the title-first path (choose a job title instead of pasting a
 * job description). No network/framework here (Humble Object), so every branch is
 * unit-testable with canned inputs. The repository fetches O*NET rows and calls
 * these; the derived requirement list then flows through the same `saveTargetRole`
 * orchestration the JD path uses.
 */

/** Default number of requirements derived from an occupation. */
export const DEFAULT_REQUIREMENT_LIMIT = 12;

/** Default number of title suggestions shown in the typeahead. */
export const DEFAULT_SUGGESTION_LIMIT = 10;

/** One rated attribute of an occupation (an O*NET skill or knowledge element). */
export type OccupationAttribute = {
  name: string;
  /** O*NET importance rating (scale IM, 1–5); higher is more important. */
  importance: number;
};

/**
 * Which catalog a title suggestion came from. "framework" and "specialization"
 * are both part of the Skills & Practices Framework (and share the "Framework"
 * UI tag); they are distinguished so the right derivation path runs — a job-
 * function's curated skills vs. a specialization's tasks + related-role skills.
 */
export type RoleSource = "framework" | "specialization" | "onet";

export type OccupationSuggestion = {
  id: string;
  name: string;
  /** O*NET-SOC code (onet) or framework slug (framework), used to derive skills. */
  code: string;
  source: RoleSource;
};

/** A Skills & Practices Framework job-function considered for the typeahead. */
export type FrameworkRoleCandidate = {
  id: string;
  name: string;
  /** Framework slug. */
  code: string;
  /** "Other job titles you may see in the world" — colloquial aliases. */
  aliases: string[];
};

/** A Skills & Practices Framework specialization considered for the typeahead. */
export type SpecializationCandidate = {
  id: string;
  name: string;
  /** Framework slug. */
  code: string;
  /** Related job-function titles and the free-text "Roles" field, for matching. */
  aliases: string[];
};

/**
 * Turn an occupation's rated attributes into a focused requirement list: drop
 * blanks, de-duplicate by name (case-insensitive, keeping the highest
 * importance), rank by importance (descending, then name for a stable order),
 * and take the top `limit`. Returns the display names.
 */
export function buildRequirementsFromOccupation(
  attributes: OccupationAttribute[],
  limit: number = DEFAULT_REQUIREMENT_LIMIT
): string[] {
  const byName = new Map<string, OccupationAttribute>();
  for (const attr of attributes) {
    const name = attr.name.trim();
    if (name.length === 0) {
      continue;
    }
    const key = name.toLowerCase();
    const importance = Number.isFinite(attr.importance) ? attr.importance : 0;
    const existing = byName.get(key);
    if (!existing || importance > existing.importance) {
      byName.set(key, { name, importance });
    }
  }

  return [...byName.values()]
    .sort((a, b) =>
      b.importance !== a.importance
        ? b.importance - a.importance
        : a.name.localeCompare(b.name)
    )
    .slice(0, Math.max(0, limit))
    .map((attr) => attr.name);
}

/**
 * Order occupation-title suggestions for the typeahead: titles that *start with*
 * the typed prefix come first, then titles that merely *contain* it; everything
 * that matches neither is dropped. Within each group the input order is kept.
 * Case-insensitive; capped at `limit`.
 */
export function rankOccupationSuggestions(
  prefix: string,
  candidates: OccupationSuggestion[],
  limit: number = DEFAULT_SUGGESTION_LIMIT
): OccupationSuggestion[] {
  const needle = prefix.trim().toLowerCase();
  if (needle.length === 0) {
    return [];
  }

  const starts: OccupationSuggestion[] = [];
  const contains: OccupationSuggestion[] = [];
  for (const candidate of candidates) {
    const name = candidate.name.toLowerCase();
    if (name.startsWith(needle)) {
      starts.push(candidate);
    } else if (name.includes(needle)) {
      contains.push(candidate);
    }
  }

  return [...starts, ...contains].slice(0, Math.max(0, limit));
}

// --- Skills & Practices Framework job-functions -----------------------------

/** Framework payload fields that hold a role's skills, best first. */
const FRAMEWORK_SKILL_FIELDS = [
  "Skills Required for the Role",
  "Foundational Skills",
  "Skills",
] as const;

const ALIAS_FIELD = "Other Job Titles You May See in the World";

/** Read a label from a framework relation entry (a string, or an object with `label`). */
function entryLabel(entry: unknown): string {
  if (typeof entry === "string") {
    return entry.trim();
  }
  if (entry && typeof entry === "object" && "label" in entry) {
    const label = (entry as { label: unknown }).label;
    return typeof label === "string" ? label.trim() : "";
  }
  return "";
}

function dedupeByLower(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (v.length > 0 && !seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

/**
 * Derive a requirement list from a framework job-function's payload: use the most
 * specific skills field available ("Skills Required for the Role", then
 * "Foundational Skills", then "Skills"), map entries to labels, de-duplicate, and
 * cap. These are already Framework skills, so saving them resolves to framework
 * provenance.
 */
export function extractFrameworkRoleSkills(
  payload: Record<string, unknown>,
  limit: number = DEFAULT_REQUIREMENT_LIMIT
): string[] {
  for (const field of FRAMEWORK_SKILL_FIELDS) {
    const raw = payload[field];
    if (Array.isArray(raw) && raw.length > 0) {
      const labels = dedupeByLower(
        raw.map(entryLabel).filter((l) => l.length > 0)
      );
      if (labels.length > 0) {
        return labels.slice(0, Math.max(0, limit));
      }
    }
  }
  return [];
}

/**
 * Parse the colloquial aliases from a framework job-function's payload. The field
 * is a comma-separated string (e.g. "Product Designer, UI/UX Designer"); an array
 * is also accepted defensively.
 */
export function parseRoleAliases(payload: Record<string, unknown>): string[] {
  const raw = payload[ALIAS_FIELD];
  const parts =
    typeof raw === "string"
      ? raw.split(",")
      : Array.isArray(raw)
        ? raw.map((e) => entryLabel(e))
        : [];
  return dedupeByLower(parts.map((p) => p.trim()).filter((p) => p.length > 0));
}

/** A named, aliased candidate (a job-function or a specialization) to rank. */
type NamedCandidate = {
  id: string;
  name: string;
  code: string;
  aliases: string[];
};

/**
 * Shared ranking for name+alias candidates: a candidate matches when the prefix
 * hits its name or any alias; name-prefix matches come first, then other
 * name/alias matches. Case-insensitive, capped, and tagged with `source`.
 */
function rankNamedCandidates(
  prefix: string,
  candidates: NamedCandidate[],
  source: RoleSource,
  limit: number
): OccupationSuggestion[] {
  const needle = prefix.trim().toLowerCase();
  if (needle.length === 0) {
    return [];
  }

  const starts: OccupationSuggestion[] = [];
  const contains: OccupationSuggestion[] = [];
  for (const candidate of candidates) {
    const name = candidate.name.toLowerCase();
    const suggestion: OccupationSuggestion = {
      id: candidate.id,
      name: candidate.name,
      code: candidate.code,
      source,
    };
    if (name.startsWith(needle)) {
      starts.push(suggestion);
    } else if (
      name.includes(needle) ||
      candidate.aliases.some((a) => a.toLowerCase().includes(needle))
    ) {
      contains.push(suggestion);
    }
  }

  return [...starts, ...contains].slice(0, Math.max(0, limit));
}

/**
 * Order framework job-functions for the typeahead: a role matches when the prefix
 * hits its name or any of its aliases, so "ux" finds "UX Designer". Name-prefix
 * matches come first, then other name/alias matches. Tagged source="framework".
 */
export function rankFrameworkRoles(
  prefix: string,
  roles: FrameworkRoleCandidate[],
  limit: number = DEFAULT_SUGGESTION_LIMIT
): OccupationSuggestion[] {
  return rankNamedCandidates(prefix, roles, "framework", limit);
}

// --- Skills & Practices Framework specializations ---------------------------

const SPECIALIZATION_TASKS_FIELD = "Specialization Tasks";
const RELATED_POSITIONS_FIELD = "Related Tech Fleet Positions";
const ROLES_FIELD = "Roles";

/** Read the `slug` of a framework relation entry (an object with a `slug`). */
function entrySlug(entry: unknown): string {
  if (entry && typeof entry === "object" && "slug" in entry) {
    const slug = (entry as { slug: unknown }).slug;
    return typeof slug === "string" ? slug.trim() : "";
  }
  return "";
}

/**
 * The specialization's own task labels (e.g. "Card Sorting", "Usability
 * Testing"). These labels are drawn from the framework's activities, so saving
 * them resolves to framework provenance. De-duplicated and trimmed.
 */
export function parseSpecializationTasks(
  payload: Record<string, unknown>
): string[] {
  const raw = payload[SPECIALIZATION_TASKS_FIELD];
  if (!Array.isArray(raw)) {
    return [];
  }
  return dedupeByLower(raw.map(entryLabel).filter((l) => l.length > 0));
}

/**
 * The slugs of the job-functions related to this specialization. The repository
 * walks these to borrow their curated skills when a specialization has few or no
 * tasks of its own.
 */
export function parseRelatedRoleSlugs(
  payload: Record<string, unknown>
): string[] {
  const raw = payload[RELATED_POSITIONS_FIELD];
  if (!Array.isArray(raw)) {
    return [];
  }
  return dedupeByLower(raw.map(entrySlug).filter((s) => s.length > 0));
}

/**
 * Aliases used to find a specialization in the typeahead: the labels of its
 * related job-functions plus the free-text "Roles" field, so "researcher" can
 * surface "Qualitative UX Research".
 */
export function parseSpecializationAliases(
  payload: Record<string, unknown>
): string[] {
  const relatedRaw = payload[RELATED_POSITIONS_FIELD];
  const related = Array.isArray(relatedRaw) ? relatedRaw.map(entryLabel) : [];
  const rolesRaw = payload[ROLES_FIELD];
  const roles =
    typeof rolesRaw === "string"
      ? [rolesRaw]
      : Array.isArray(rolesRaw)
        ? rolesRaw.map(entryLabel)
        : [];
  return dedupeByLower(
    [...related, ...roles].map((s) => s.trim()).filter((s) => s.length > 0)
  );
}

/**
 * Derive a specialization's requirement list: its own tasks first (the most
 * specialization-specific signal, and already framework activities), then the
 * skills of its related job-functions, de-duplicated (case-insensitive) and
 * capped. `relatedRoleSkills` is the already-extracted skills of the related
 * job-functions (the repository fetches and extracts them).
 */
export function extractSpecializationRequirements(
  payload: Record<string, unknown>,
  relatedRoleSkills: string[] = [],
  limit: number = DEFAULT_REQUIREMENT_LIMIT
): string[] {
  const tasks = parseSpecializationTasks(payload);
  return dedupeByLower([...tasks, ...relatedRoleSkills]).slice(
    0,
    Math.max(0, limit)
  );
}

/**
 * Order specializations for the typeahead: matches on the specialization name or
 * an alias (related job-function title / "Roles"). Name-prefix matches first.
 * Tagged source="specialization" so derivation uses the specialization path.
 */
export function rankSpecializations(
  prefix: string,
  specializations: SpecializationCandidate[],
  limit: number = DEFAULT_SUGGESTION_LIMIT
): OccupationSuggestion[] {
  return rankNamedCandidates(prefix, specializations, "specialization", limit);
}
