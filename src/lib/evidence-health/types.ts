/**
 * Types for Evidence-health indicators (MVP 2 Phase 3, plan §6.6). A read-only projection over
 * data that already exists — claim lifecycle (ADR-0022), the investigation signals
 * ([[investigation-queue]]), projects (ADR-0019), and gap assessments (ADR-0011). There is NO
 * health table and NO single score (AC2): each indicator is a specific, actionable count that
 * updates as the underlying rows change. Pure data shapes, free of Supabase and React, so the
 * assembler (build.ts) is unit-tested with canned inputs (Humble Object, CLAUDE.md §3).
 */
import type { ClaimLifecycleState } from "@/lib/claims/lifecycle";
import type { TagTone } from "@/theme-tokens";

/** The fixed global indicators (always shown, so the picture stays honest and stable). */
export const HEALTH_INDICATOR_KEYS = [
  "well_supported",
  "needs_verification",
  "outstanding_investigations",
  "projects_need_evidence",
] as const;
export type HealthIndicatorKey = (typeof HEALTH_INDICATOR_KEYS)[number];

/** One global indicator: a count with a plain label, an explanation, a tone, and a deep-link (AC3). */
export type HealthIndicator = {
  key: HealthIndicatorKey;
  label: string;
  count: number;
  detail: string;
  tone: TagTone;
  action: { label: string; href: string };
};

/** Per-target-role coverage: how many requirements your evidence backs, deep-linked to the gap check. */
export type RoleCoverage = {
  roleId: string;
  title: string;
  /** Requirements with a met or partial verdict (both rest on a real citation). */
  supported: number;
  /** Total requirements for the role. */
  total: number;
  /** How many requirements have been assessed at all (0 ⇒ the role hasn't been checked yet). */
  assessed: number;
  href: string;
};

/** The whole health view-model. */
export type EvidenceHealth = {
  indicators: HealthIndicator[];
  roleCoverage: RoleCoverage[];
};

/** Already-computed role coverage, before it becomes a display row. */
export type RoleCoverageInput = {
  roleId: string;
  title: string;
  supported: number;
  total: number;
  assessed: number;
};

/** Everything the server collects, handed to the pure assembler. */
export type HealthInputs = {
  /** The lifecycle of every active (non-archived) claim. */
  claimLifecycles: ClaimLifecycleState[];
  /** Size of the Investigation Queue (reused from the investigations module). */
  investigationCount: number;
  /** Projects with no linked files, records, or learning moments. */
  projectsNeedingEvidence: number;
  /** Per-role coverage inputs. */
  roles: RoleCoverageInput[];
};

/** An empty input set — the honest "nothing yet" baseline. */
export const EMPTY_HEALTH_INPUTS: HealthInputs = {
  claimLifecycles: [],
  investigationCount: 0,
  projectsNeedingEvidence: 0,
  roles: [],
};
