/**
 * Structured provenance types (Phase 1, ADR-0022 §5.2). The small, pure building blocks for
 * attribution (who did the work), supporting-span location, and the missing-info store. Zod is
 * the single source of truth for the enums; no Supabase, no React, so these are unit-tested
 * with plain inputs (Humble Object / Dependency Inversion, CLAUDE.md §3).
 */
import { z } from "zod";

/**
 * Who performed the work a record describes. Mirrors the `decision_records.contribution` CHECK.
 * There is deliberately no "individual" default: a record with no contribution set is
 * UNSPECIFIED, so team or project work is never silently presented as a solo accomplishment.
 */
export const CONTRIBUTIONS = ["individual", "team", "project"] as const;
export const contributionSchema = z.enum(CONTRIBUTIONS);
export type Contribution = z.infer<typeof contributionSchema>;

/**
 * Parse a raw contribution value (e.g. a form field) into a `Contribution` or `null`
 * (unspecified). A blank, missing, or unrecognised value is unspecified — never coerced to
 * "individual" (AC4).
 */
export function parseContribution(value: unknown): Contribution | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const parsed = contributionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Human labels for the attribution choices (form + review display). */
const CONTRIBUTION_LABELS: Record<Contribution, string> = {
  individual: "I did this individually",
  team: "A team did this together",
  project: "Project-level work",
};

/** Label for a contribution value, or "Unspecified" when it is null. */
export function contributionLabel(value: Contribution | null): string {
  return value === null ? "Unspecified" : CONTRIBUTION_LABELS[value];
}

/** The lifecycle of a missing-info item. Mirrors the `missing_info_items.status` CHECK. */
export const MISSING_INFO_STATUSES = ["open", "resolved"] as const;
export const missingInfoStatusSchema = z.enum(MISSING_INFO_STATUSES);
export type MissingInfoStatus = z.infer<typeof missingInfoStatusSchema>;

/**
 * A structured "what is still unknown" item, hung off at least one subject (a decision record,
 * a claim, and/or a role requirement). Mirrors the `missing_info_items` row the app reads/writes.
 */
export const missingInfoItemSchema = z
  .object({
    decisionRecordId: z.string().uuid().nullable().default(null),
    claimId: z.string().uuid().nullable().default(null),
    roleRequirementId: z.string().uuid().nullable().default(null),
    description: z.string().trim().min(1, "Describe what is missing."),
    status: missingInfoStatusSchema.default("open"),
  })
  .refine(
    (item) =>
      item.decisionRecordId !== null ||
      item.claimId !== null ||
      item.roleRequirementId !== null,
    {
      message:
        "A missing-info item must reference a record, claim, or requirement.",
    }
  );
export type MissingInfoItemInput = z.input<typeof missingInfoItemSchema>;
export type MissingInfoItem = z.infer<typeof missingInfoItemSchema>;

export type MissingInfoResult =
  { ok: true; value: MissingInfoItem } | { ok: false; error: string };

/** Validate a raw missing-info item, returning a single human-readable error on failure. */
export function validateMissingInfoItem(input: unknown): MissingInfoResult {
  const parsed = missingInfoItemSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  return {
    ok: false,
    error: parsed.error.issues[0]?.message ?? "Invalid missing-info item.",
  };
}
