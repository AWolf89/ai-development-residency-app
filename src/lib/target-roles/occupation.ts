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

export type OccupationSuggestion = {
  id: string;
  name: string;
  /** O*NET-SOC code, used to fetch the occupation's attributes. */
  code: string;
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
