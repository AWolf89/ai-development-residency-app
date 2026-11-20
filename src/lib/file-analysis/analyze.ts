/**
 * Pure tag-validation logic for File Analysis (ADR-0020). No IO and no `server-only` import, so
 * it is unit-tested with plain inputs (Dependency Inversion). The thin boundary that wires the
 * real retriever + model gateway lives in classifier.ts (Humble Object, CLAUDE.md §3).
 *
 * The closed-RAG safety property lives here, not in the prompt: a model tag is kept ONLY when it
 * points at a real candidate `reference_items` row. A tag referencing an id that was never a
 * candidate is dropped — the model cannot invent a competency that is not in the framework/O*NET.
 * This is the same guarantee Gap Classification's `validateCitations` gives (ADR-0011).
 */
import type {
  Candidate,
  Confidence,
  ModelTag,
  ProposedTag,
} from "./types";

/**
 * Keep only model tags that point at a really-offered candidate; dedup by reference_item id.
 * Each kept tag is enriched with the candidate's identity (name, entity_type, source) so the
 * downstream proposal and `file_reference_tags` row never trust a model-supplied name.
 */
export function validateTags(
  returned: ModelTag[],
  candidates: Candidate[]
): ProposedTag[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const out: ProposedTag[] = [];
  const seen = new Set<string>();
  for (const tag of returned) {
    const candidate = byId.get(tag.referenceItemId);
    if (candidate && !seen.has(candidate.id)) {
      out.push({
        referenceItemId: candidate.id,
        source: candidate.source,
        entityType: candidate.entityType,
        externalId: candidate.externalId,
        name: candidate.name,
        confidence: tag.confidence,
        rationale: tag.rationale,
      });
      seen.add(candidate.id);
    }
  }
  return out;
}

/**
 * The subset safe to apply without review — only high-confidence tags. Used by the batch
 * "Analyze all" path (ADR-0020): a file whose only tags are low/medium confidence has none
 * applied and is left for interactive review rather than tagged unattended.
 */
export function highConfidenceOnly(tags: ProposedTag[]): ProposedTag[] {
  return tags.filter((tag) => tag.confidence === "high");
}

/**
 * Whether the batch path should mark a file "Needs review" rather than auto-apply: true when the
 * model asked questions (ambiguous) OR there is at least one non-high-confidence tag the user
 * should weigh in on. A file with only high-confidence tags and no questions applies cleanly.
 */
export function needsReview(
  tags: ProposedTag[],
  questionCount: number
): boolean {
  if (questionCount > 0) return true;
  return tags.some((tag) => tag.confidence !== "high");
}

/** Map a validated proposed tag + context to a `file_reference_tags` row (own-rows RLS). */
export function toTagRow(
  tag: ProposedTag,
  ctx: { userId: string; fileId: string }
): {
  user_id: string;
  file_id: string;
  reference_item_id: string;
  entity_type: string;
  confidence: Confidence;
  rationale: string;
} {
  return {
    user_id: ctx.userId,
    file_id: ctx.fileId,
    reference_item_id: tag.referenceItemId,
    entity_type: tag.entityType,
    confidence: tag.confidence,
    rationale: tag.rationale,
  };
}
