/**
 * Shared types for the reference-data layer (E4).
 *
 * A ReferenceItem is one row destined for the `reference_items` table. The
 * Zod schema is the single source of truth: mappers build a plain object and
 * validate it here before it reaches the database (defensive, structural
 * validation rather than trusting the source data). Kept dependency-free of
 * Supabase so it can be unit-tested with plain inputs (Humble Object).
 */
import { z } from "zod";

export const REFERENCE_SOURCES = ["techfleet-spf", "onet"] as const;
export type ReferenceSource = (typeof REFERENCE_SOURCES)[number];

export const referenceItemSchema = z.object({
  source: z.enum(REFERENCE_SOURCES),
  entity_type: z.string().min(1),
  external_id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  source_version: z.string().nullable(),
});

export type ReferenceItem = z.infer<typeof referenceItemSchema>;
