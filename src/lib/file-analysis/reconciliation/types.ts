/**
 * Types for cross-document reconciliation (MVP 2 Phase 2, ADR-0023). At ingest the agent compares
 * a new upload against the user's existing evidence and records contradictions (date / metric /
 * ownership) and complementary matches, each citing the existing source it relates to.
 *
 * Zod is the single source of truth; the TS types are inferred from it, so the model-output
 * contract, the validated flag, and the DB row are validated the same way. Pure data shapes, free
 * of Supabase and the AI SDK, so the grounding (compare.ts) is unit-tested with plain inputs
 * (Humble Object / Dependency Inversion, CLAUDE.md §3).
 *
 * Grounding mirrors the reviewer (ADR-0016): a flag may never cite evidence that was not actually
 * retrieved, so a conflict can never be invented against a source that does not exist.
 */
import { z } from "zod";
import type { Citation } from "@/lib/rag/types";

/** date/metric/ownership are conflicts; 'complementary' = same subject, safe to link (not a conflict). */
export const RECONCILIATION_KINDS = [
  "date",
  "metric",
  "ownership",
  "complementary",
] as const;
export const reconciliationKindSchema = z.enum(RECONCILIATION_KINDS);
export type ReconciliationKind = z.infer<typeof reconciliationKindSchema>;

/** A flag's lifecycle: proposed (pending) until the user accepts or dismisses it. */
export const RECONCILIATION_DISPOSITIONS = [
  "pending",
  "accepted",
  "dismissed",
] as const;
export const reconciliationDispositionSchema = z.enum(
  RECONCILIATION_DISPOSITIONS
);
export type ReconciliationDisposition = z.infer<
  typeof reconciliationDispositionSchema
>;

// An optional free-text field: a blank value becomes undefined.
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

/** What the model returns per citation: a pointer to an existing source by source+id. */
export const modelCitationSchema = z.object({
  source: z.string().min(1),
  id: z.string().min(1),
});
export type ModelCitation = z.infer<typeof modelCitationSchema>;

/** One finding the model returns, citing the existing source(s) it relates to. */
export const modelReconciliationFlagSchema = z.object({
  kind: reconciliationKindSchema,
  message: z.string().trim().min(1).max(600),
  /** The new document's value (e.g. "19%", "Jan–Mar"); omitted for a pure complementary match. */
  newValue: optionalText,
  /** The existing record's conflicting value. */
  existingValue: optionalText,
  citations: z.array(modelCitationSchema).max(8),
});
export type ModelReconciliationFlag = z.infer<
  typeof modelReconciliationFlagSchema
>;

/** The structured output of one reconciliation call (validated by Zod before grounding). */
export const reconciliationOutputSchema = z.object({
  flags: z.array(modelReconciliationFlagSchema).max(20),
});
export type ReconciliationOutput = z.infer<typeof reconciliationOutputSchema>;

/** A validated citation pointing at a really-retrieved existing source. */
export const citationSchema = z.object({
  source: z.string().min(1),
  id: z.string().min(1),
  title: z.string(),
});

/** A grounded, display-ready reconciliation flag (citations validated, disposition pending). */
export const reconciliationFlagSchema = z.object({
  kind: reconciliationKindSchema,
  message: z.string().min(1),
  newValue: z.string().nullable(),
  existingValue: z.string().nullable(),
  /** Validated citations into really-retrieved existing evidence (≥1 — enforced by grounding). */
  citations: z.array(citationSchema).min(1),
  disposition: reconciliationDispositionSchema,
});
export type ReconciliationFlag = z.infer<typeof reconciliationFlagSchema>;

/** A row destined for `reconciliation_flags` (own-rows RLS, ADR-0023). */
export type ReconciliationFlagRow = {
  user_id: string;
  file_id: string;
  kind: ReconciliationKind;
  message: string;
  new_value: string | null;
  existing_value: string | null;
  citations: Citation[];
  disposition: ReconciliationDisposition;
  model_used: string | null;
  prompt_version: string | null;
};
