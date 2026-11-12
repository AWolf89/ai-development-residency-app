/**
 * Pure, dependency-free validation for the target-role intake.
 *
 * Humble Object: no network/framework, so it is unit-testable with plain inputs.
 * This is the save gate — it enforces AC9 (a job description that is empty or too
 * short to work with is rejected and no target role is created) and guarantees a
 * saved role has a title and at least one requirement (AC4).
 */

/** A job description shorter than this can't yield meaningful requirements. */
export const MIN_JD_LENGTH = 30;

export type TargetRoleIntakeInput = {
  title: string;
  jobDescription: string;
  requirements: string[];
};

export type ValidationResult =
  { ok: true; value: TargetRoleIntakeInput } | { ok: false; error: string };

export type JobDescriptionResult =
  { ok: true; value: string } | { ok: false; error: string };

/**
 * Validate the pasted job description on its own (used before extraction, AC9).
 */
export function validateJobDescription(text: unknown): JobDescriptionResult {
  if (typeof text !== "string" || text.trim().length === 0) {
    return { ok: false, error: "Paste a job description." };
  }
  if (text.trim().length < MIN_JD_LENGTH) {
    return {
      ok: false,
      error: "Paste a fuller job description so its requirements can be read.",
    };
  }
  return { ok: true, value: text.trim() };
}

/**
 * Shared core: a title and at least one non-blank requirement are always
 * required. The job description is required on the paste path (`requireJobDescription`)
 * and optional on the title path, where requirements come from the chosen
 * occupation instead.
 */
function validateCore(
  input: unknown,
  requireJobDescription: boolean
): ValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Enter a role title." };
  }
  const obj = input as Record<string, unknown>;

  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  if (title.length === 0) {
    return { ok: false, error: "Enter a role title." };
  }

  let jobDescription: string;
  if (requireJobDescription) {
    const jd = validateJobDescription(obj.jobDescription);
    if (!jd.ok) {
      return { ok: false, error: jd.error };
    }
    jobDescription = jd.value;
  } else {
    jobDescription =
      typeof obj.jobDescription === "string" ? obj.jobDescription.trim() : "";
  }

  const rawRequirements = Array.isArray(obj.requirements)
    ? obj.requirements
    : [];
  const requirements = rawRequirements
    .map((r) => (typeof r === "string" ? r.trim() : ""))
    .filter((r) => r.length > 0);

  if (requirements.length === 0) {
    return { ok: false, error: "Add at least one requirement before saving." };
  }

  return { ok: true, value: { title, jobDescription, requirements } };
}

/**
 * Validate the paste path before saving: a title, a usable job description, and
 * at least one non-blank requirement.
 */
export function validateTargetRoleIntake(input: unknown): ValidationResult {
  return validateCore(input, true);
}

/**
 * Validate the title path before saving: a title and at least one requirement
 * (derived from the chosen occupation). The job description is optional here.
 */
export function validateTargetRoleFromTitle(input: unknown): ValidationResult {
  return validateCore(input, false);
}
