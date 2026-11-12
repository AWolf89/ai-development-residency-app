/**
 * Resolve a requirement's provenance label from its match results (AC6/AC7/AC8).
 *
 * Pure precedence chain: a Skills & Practices Framework match wins; otherwise an
 * O*NET match; otherwise the requirement is kept as pasted and labelled
 * "job_description". Mirrors the DB CHECK on role_requirements.source.
 */

export type SourceLabel = "framework" | "onet" | "job_description";

export type ReferenceMatch = { id: string } | null;

export type ResolvedSource = {
  source: SourceLabel;
  referenceItemId: string | null;
};

export function resolveSource(opts: {
  frameworkMatch: ReferenceMatch;
  onetMatch: ReferenceMatch;
}): ResolvedSource {
  if (opts.frameworkMatch) {
    return { source: "framework", referenceItemId: opts.frameworkMatch.id };
  }
  if (opts.onetMatch) {
    return { source: "onet", referenceItemId: opts.onetMatch.id };
  }
  return { source: "job_description", referenceItemId: null };
}
