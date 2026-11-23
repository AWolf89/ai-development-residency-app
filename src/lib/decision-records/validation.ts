/**
 * Pure, dependency-free validation for a decision record.
 *
 * Kept separate from the Server Action (Humble Object pattern) so it can be
 * unit-tested with plain inputs and no network or framework involved. This is
 * the single gate that decides whether a record may be saved, so it directly
 * enforces:
 *   - AC1: the six captured fields,
 *   - AC2: the source is one of the two allowed labels,
 *   - AC6: a missing required field returns an error and nothing is saved.
 *
 * Validation is structural (Zod), not "prompt-begging": the shape is enforced by
 * a schema rather than by trusting the caller. The required set is the core one
 * agreed in design review — title, situation, decision, outcome, source — with
 * `cue` and `why` optional-but-recommended (a user can edit a saved record later
 * to add them).
 */
import { z } from "zod";
import { CLAIM_CATEGORIES, type ClaimCategory } from "@/lib/claims/types";
import { CONTRIBUTIONS, type Contribution } from "@/lib/provenance/types";

/** The two provenance labels AC2 allows. Mirrors the DB CHECK constraint. */
export const DECISION_SOURCES = ["artifact", "self_reported"] as const;
export type DecisionSource = (typeof DECISION_SOURCES)[number];

export type DecisionRecordInput = {
  title: string;
  situation: string;
  cue?: string;
  decision: string;
  why?: string;
  outcome: string;
  source: DecisionSource;
  /** Claim facet for the evidence profile (ADR-0015); omitted = unfiled. */
  category?: ClaimCategory;
  /** User mark that this claim is a self-reported metric with no file (ADR-0015). */
  isMetric: boolean;
  /**
   * Attribution — who did the work (ADR-0022 §5.2). Omitted = unspecified; never defaulted to
   * "individual" so team/project work is not presented as a solo accomplishment.
   */
  contribution?: Contribution;
  /** Optional free-text qualifier for the contribution. */
  attributionNote?: string;
};

export type ValidationResult =
  { ok: true; value: DecisionRecordInput } | { ok: false; error: string };

// A required free-text field: must be a non-empty string once trimmed.
const requiredText = z.string().trim().min(1);

// An optional free-text field: trimmed; a blank value becomes `undefined` so the
// mapper can store NULL rather than an empty string.
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

// The facet is optional: a blank value (an unfiled claim) becomes `undefined`.
const optionalCategory = z.preprocess(
  (value) =>
    typeof value === "string" && value.length > 0 ? value : undefined,
  z.enum(CLAIM_CATEGORIES).optional()
);

// Attribution is optional: a blank value stays `undefined` (unspecified) — never "individual".
const optionalContribution = z.preprocess(
  (value) =>
    typeof value === "string" && value.length > 0 ? value : undefined,
  z.enum(CONTRIBUTIONS).optional()
);

// The metric flag arrives from the form as "true"/"false" (or a checkbox "on").
const booleanFlag = z.preprocess(
  (value) =>
    value === true || value === "true" || value === "on" || value === "1",
  z.boolean()
);

const schema = z.object({
  title: requiredText,
  situation: requiredText,
  cue: optionalText,
  decision: requiredText,
  why: optionalText,
  outcome: requiredText,
  source: z.enum(DECISION_SOURCES),
  category: optionalCategory,
  isMetric: booleanFlag,
  contribution: optionalContribution,
  attributionNote: optionalText,
});

// User-facing message for the first field that fails, keyed by field path.
// Field order here is the order problems are reported in.
const FIELD_ERRORS: Record<string, string> = {
  title: "Enter a title.",
  situation: "Describe the situation.",
  decision: "Describe the decision you made.",
  outcome: "Describe the outcome.",
  source: "Choose a source: artifact or self-reported.",
};

const ERROR_ORDER = ["title", "situation", "decision", "outcome", "source"];

/**
 * Validate raw input (e.g. from a form) into a clean decision record.
 * Returns a discriminated union: `{ ok: true, value }` or `{ ok: false, error }`
 * with a single, human-readable message for the first problem found.
 */
export function validateDecisionRecord(input: unknown): ValidationResult {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }

  const failedFields = new Set(
    parsed.error.issues.map((issue) => String(issue.path[0] ?? ""))
  );

  for (const field of ERROR_ORDER) {
    if (failedFields.has(field)) {
      return { ok: false, error: FIELD_ERRORS[field] };
    }
  }

  // Fallback for a non-object input or any unmapped issue.
  return { ok: false, error: "Enter a title." };
}
