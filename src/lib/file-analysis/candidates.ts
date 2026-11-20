/**
 * Candidate grounding for File Analysis (ADR-0020) — pure helpers, no IO.
 *
 * The analysis may tag a file only with real `reference_items` rows (the closed-world set). We
 * find relevant ones by reusing the Evidence Search reference retriever (ADR-0010): a reference
 * chunk's stable id encodes the item it came from — "techfleet-spf:<entity_type>:<external_id>"
 * for a framework entity, "onet:<soc>:<section>" for an occupation (see rag/chunk.ts). These
 * functions parse those ids back into lookup keys, deduplicate them, and shape the fetched rows
 * into `Candidate`s. The actual reference_items query lives in the boundary (classifier.ts).
 */
import type { Candidate } from "./types";

const FRAMEWORK_SOURCE = "techfleet-spf";
const ONET_SOURCE = "onet";

/** Framework entity types a file may be tagged with (the taggable vocabulary). */
export const TAGGABLE_FRAMEWORK_ENTITIES = new Set([
  "skills",
  "practices",
  "practice-components",
  "duties",
  "job-functions",
  "deliverables",
  "activities",
  "specializations",
  "milestones",
  "data-types",
]);

/** A lookup key into `reference_items` (its unique business key). */
export type CandidateKey = {
  source: string;
  entity_type: string;
  external_id: string;
};

/** A raw `reference_items` row as fetched for candidate lookup. */
export type ReferenceItemRow = {
  id: string;
  source: string;
  entity_type: string;
  external_id: string;
  name: string;
  description: string | null;
};

/**
 * Parse one reference chunk hit back into the reference_items key it came from, or null when the
 * hit is not a taggable item. O*NET hits are tagged at the occupation level; framework hits map
 * to their entity, but only for entity types in the taggable set.
 */
export function parseCandidateKey(hit: {
  id: string;
  source: string;
}): CandidateKey | null {
  const parts = hit.id.split(":");
  if (hit.source === FRAMEWORK_SOURCE) {
    // "techfleet-spf:<entity_type>:<external_id>" (slugs carry no colon).
    if (parts.length !== 3) return null;
    const [, entity_type, external_id] = parts;
    if (!entity_type || !external_id) return null;
    if (!TAGGABLE_FRAMEWORK_ENTITIES.has(entity_type)) return null;
    return { source: FRAMEWORK_SOURCE, entity_type, external_id };
  }
  if (hit.source === ONET_SOURCE) {
    // "onet:<soc>:<section>" — tag at the occupation level (the retrievable O*NET unit).
    const soc = parts[1];
    if (!soc) return null;
    return { source: ONET_SOURCE, entity_type: "occupation", external_id: soc };
  }
  return null;
}

/** Deduplicate keys by their business key, preserving first-seen order. */
export function dedupeCandidateKeys(keys: CandidateKey[]): CandidateKey[] {
  const seen = new Set<string>();
  const out: CandidateKey[] = [];
  for (const key of keys) {
    const id = `${key.source}:${key.entity_type}:${key.external_id}`;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(key);
    }
  }
  return out;
}

/** Turn reference chunk hits into the deduped reference_items keys to look up. */
export function candidateKeysFromHits(
  hits: { id: string; source: string }[]
): CandidateKey[] {
  const keys: CandidateKey[] = [];
  for (const hit of hits) {
    const key = parseCandidateKey(hit);
    if (key) keys.push(key);
  }
  return dedupeCandidateKeys(keys);
}

/** Does a fetched row match one of the requested keys exactly? (query may over-fetch). */
export function rowMatchesAnyKey(
  row: ReferenceItemRow,
  keys: CandidateKey[]
): boolean {
  return keys.some(
    (key) =>
      key.source === row.source &&
      key.entity_type === row.entity_type &&
      key.external_id === row.external_id
  );
}

/** Shape a fetched reference_items row into a tagging Candidate. */
export function toCandidate(row: ReferenceItemRow): Candidate {
  return {
    id: row.id,
    source: row.source,
    entityType: row.entity_type,
    externalId: row.external_id,
    name: row.name,
    description: row.description,
  };
}
