/**
 * Pure, dependency-free validation for a learning moment (ADR-0018).
 *
 * Kept separate from the Server Action (Humble Object) so it can be unit-tested with plain
 * inputs and no network or framework. This is the single gate that decides whether a record
 * may be saved, so it directly enforces:
 *   - AC2: a kind + the captured fields (context / shift / result), and `duration` whenever
 *     the kind is `speed` (the only kind for which "how long it took" is meaningful),
 *   - AC4: an empty / whitespace-only submission returns an error and nothing is saved.
 *
 * Validation is structural (Zod), not "prompt-begging": the shape is enforced by a schema
 * rather than by trusting the caller.
 */
import { z } from "zod";
import { LEARNING_MOMENT_KINDS, type LearningMomentInput } from "./types";

export type ValidationResult =
  { ok: true; value: LearningMomentInput } | { ok: false; error: string };

// A required free-text field: must be a non-empty string once trimmed.
const requiredText = z.string().trim().min(1);

// An optional free-text field: trimmed; a blank value becomes `undefined` so the mapper
// stores NULL rather than an empty string.
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

// Optional role link: a blank value becomes `undefined`; a malformed id is dropped (the FK
// + RLS reject a bad reference anyway) so an optional link never blocks a valid save.
const optionalRoleId = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : undefined,
  z.string().uuid().optional().catch(undefined)
);

const schema = z
  .object({
    kind: z.enum(LEARNING_MOMENT_KINDS),
    context: requiredText,
    shift: requiredText,
    result: requiredText,
    duration: optionalText,
    targetRoleId: optionalRoleId,
  })
  .superRefine((value, ctx) => {
    // AC2: "how long it took" is required for the speed kind only.
    if (value.kind === "speed" && !value.duration) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["duration"],
        message: "duration is required for a speed moment",
      });
    }
  });

// User-facing message for the first field that fails, keyed by field path.
const FIELD_ERRORS: Record<string, string> = {
  kind: "Choose a kind of learning moment.",
  context: "Describe the situation you were in.",
  shift: "Describe what you learned or what changed.",
  result: "Describe the result.",
  duration: "Enter how long it took.",
};

// The order problems are reported in.
const ERROR_ORDER = ["kind", "context", "shift", "result", "duration"];

/**
 * Validate raw input (e.g. from a form) into a clean learning moment. Returns a
 * discriminated union: `{ ok: true, value }` or `{ ok: false, error }` with a single,
 * human-readable message for the first problem found.
 */
export function validateLearningMoment(input: unknown): ValidationResult {
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
  return { ok: false, error: "Choose a kind of learning moment." };
}
