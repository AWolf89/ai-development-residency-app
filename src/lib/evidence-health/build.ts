/**
 * The pure Evidence-health assembler (MVP 2 Phase 3, plan §6.6). Turns the collected inputs into
 * the four fixed indicators plus per-role coverage. No IO and no `server-only` import, so it is
 * unit-tested with canned inputs (Humble Object, CLAUDE.md §3). There is deliberately NO single
 * overall score (AC2): each indicator is specific and deep-linked (AC3), and every number is
 * derived from a real signal (AC1) — an empty input set yields all-zero indicators and no roles.
 */
import type { ClaimLifecycleState } from "@/lib/claims/lifecycle";
import {
  HEALTH_INDICATOR_KEYS,
  type EvidenceHealth,
  type HealthIndicator,
  type HealthIndicatorKey,
  type HealthInputs,
  type RoleCoverage,
} from "./types";

/** Lifecycle states that count as a claim being well-supported (evidence or an explicit confirm). */
const WELL_SUPPORTED: ReadonlySet<ClaimLifecycleState> = new Set([
  "supported",
  "user_confirmed",
]);

/** Active lifecycle states that still need verification (archived is excluded entirely). */
const NEEDS_VERIFICATION: ReadonlySet<ClaimLifecycleState> = new Set([
  "draft",
  "needs_investigation",
  "challenged",
]);

function countLifecycles(
  lifecycles: ClaimLifecycleState[],
  set: ReadonlySet<ClaimLifecycleState>
): number {
  return lifecycles.filter((l) => set.has(l)).length;
}

/** Build one global indicator by key from the already-counted numbers. */
function indicatorFor(key: HealthIndicatorKey, count: number): HealthIndicator {
  switch (key) {
    case "well_supported":
      return {
        key,
        count,
        label: "Well-supported claims",
        detail: "Backed by evidence or confirmed by you.",
        tone: "green",
        action: { label: "View claims", href: "/dashboard/claims" },
      };
    case "needs_verification":
      return {
        key,
        count,
        label: "Claims needing verification",
        detail:
          "Not yet backed by evidence — investigate or confirm them. A missing file isn't a missing skill.",
        tone: "orange",
        action: { label: "View claims", href: "/dashboard/claims" },
      };
    case "outstanding_investigations":
      return {
        key,
        count,
        label: "Outstanding investigations",
        detail: "Open items worth looking into next.",
        tone: "blue",
        action: {
          label: "Open queue",
          href: "/dashboard/investigations",
        },
      };
    case "projects_need_evidence":
      return {
        key,
        count,
        label: "Projects needing evidence",
        detail: "Projects with nothing linked to them yet.",
        tone: "gray",
        action: { label: "View projects", href: "/dashboard/projects" },
      };
  }
}

function toRoleCoverage(inputs: HealthInputs): RoleCoverage[] {
  return inputs.roles.map((r) => ({
    roleId: r.roleId,
    title: r.title,
    supported: r.supported,
    total: r.total,
    assessed: r.assessed,
    href: `/dashboard/gap-check?role=${r.roleId}`,
  }));
}

/** Assemble the health view-model: four fixed indicators (always present) plus per-role coverage. */
export function buildHealth(inputs: HealthInputs): EvidenceHealth {
  const counts: Record<HealthIndicatorKey, number> = {
    well_supported: countLifecycles(inputs.claimLifecycles, WELL_SUPPORTED),
    needs_verification: countLifecycles(
      inputs.claimLifecycles,
      NEEDS_VERIFICATION
    ),
    outstanding_investigations: inputs.investigationCount,
    projects_need_evidence: inputs.projectsNeedingEvidence,
  };

  return {
    indicators: HEALTH_INDICATOR_KEYS.map((key) =>
      indicatorFor(key, counts[key])
    ),
    roleCoverage: toRoleCoverage(inputs),
  };
}
