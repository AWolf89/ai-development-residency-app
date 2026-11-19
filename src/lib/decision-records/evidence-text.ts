/**
 * Pure assembly of a decision record's fields into one labeled text block for
 * evidence indexing. Kept dependency-free (no Supabase, no network) so the format is
 * unit-tested with plain inputs. Optional fields (`cue`, `why`) are omitted when blank
 * so the chunker never embeds empty "Cue:" / "Why:" lines.
 */
export type DecisionRecordFields = {
  title: string;
  situation: string;
  cue?: string;
  decision: string;
  why?: string;
  outcome: string;
};

export function decisionRecordToEvidenceText(
  fields: DecisionRecordFields
): string {
  const lines: Array<string | null> = [
    `Title: ${fields.title}`,
    `Situation: ${fields.situation}`,
    fields.cue?.trim() ? `Cue: ${fields.cue}` : null,
    `Decision: ${fields.decision}`,
    fields.why?.trim() ? `Why: ${fields.why}` : null,
    `Outcome: ${fields.outcome}`,
  ];
  return lines.filter((l): l is string => l !== null).join("\n\n");
}
