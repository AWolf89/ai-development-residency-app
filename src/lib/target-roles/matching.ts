/**
 * Deterministic, non-AI matching of a requirement to a reference item by name.
 *
 * Pure and unit-tested. Used for the Skills & Practices Framework (the small 453-row
 * set, matched in memory). It is a token-overlap heuristic, not semantic matching —
 * the Week-4 upgrade replaces it with embeddings; the interface stays the same.
 */

export type FrameworkItem = { id: string; name: string };

// A requirement must cover at least this share of a reference item's name words.
const MATCH_THRESHOLD = 0.6;

const STOPWORDS = new Set([
  "and",
  "the",
  "with",
  "for",
  "of",
  "to",
  "in",
  "or",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Pick a single significant search term (the longest usable token) from a
 * requirement, for the O*NET fallback's indexed name search. Returns null when
 * the requirement has no usable token. Pure so the repository boundary stays thin.
 */
export function pickOnetSearchTerm(requirement: string): string | null {
  const tokens = tokenize(requirement);
  if (tokens.length === 0) {
    return null;
  }
  return tokens.reduce((longest, t) =>
    t.length > longest.length ? t : longest
  );
}

/**
 * Return the best framework item whose name is sufficiently covered by the
 * requirement text, or null when nothing clears the threshold.
 */
export function matchFramework(
  requirement: string,
  items: FrameworkItem[]
): FrameworkItem | null {
  const reqTokens = new Set(tokenize(requirement));
  if (reqTokens.size === 0) {
    return null;
  }

  let best: FrameworkItem | null = null;
  let bestScore = 0;

  for (const item of items) {
    const itemTokens = tokenize(item.name);
    if (itemTokens.length === 0) {
      continue;
    }
    const matched = itemTokens.filter((t) => reqTokens.has(t)).length;
    const score = matched / itemTokens.length;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return bestScore >= MATCH_THRESHOLD ? best : null;
}
