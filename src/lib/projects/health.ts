/**
 * Pure per-project health for the Projects list (MVP 2 Phase 3, plan §6.2; Figma "Projects").
 * Turns a project's claim lifecycles (ADR-0022) into the card's health bar, counts, derived
 * display status, and "to investigate" number. No IO and no React, so it is unit-tested with
 * canned inputs (Humble Object, CLAUDE.md §3). Every number is derived from real rows (AC2);
 * a project with no claims yields an all-zero health and reads honestly in the UI.
 */
import type { ClaimLifecycleState } from "@/lib/claims/lifecycle";
import { brand, type TagTone } from "@/theme-tokens";

/**
 * The derived display status shown on a project card. The DB stores only active/archived
 * (ADR-0019); these three are computed so the list can speak the product's language without a
 * new column: archived ⇒ Complete, an open challenge ⇒ Needs attention, otherwise In progress.
 */
export type ProjectDisplayStatus =
  "in_progress" | "needs_attention" | "complete";

export type ProjectHealth = {
  /** Claims backed by evidence or confirmed (lifecycle supported/user_confirmed). */
  supported: number;
  /** Claims not yet backed (lifecycle draft/needs_investigation). */
  needEvidence: number;
  /** Claims with an open challenge (lifecycle challenged). */
  challenged: number;
  /** Total active (non-archived) claims counted. */
  claims: number;
  /** Things worth looking into: claims needing evidence or challenged. */
  toInvestigate: number;
};

/** Count a project's active claims by lifecycle into the health bar segments. */
export function computeProjectHealth(
  lifecycles: ClaimLifecycleState[]
): ProjectHealth {
  let supported = 0;
  let needEvidence = 0;
  let challenged = 0;
  for (const l of lifecycles) {
    switch (l) {
      case "supported":
      case "user_confirmed":
        supported += 1;
        break;
      case "draft":
      case "needs_investigation":
        needEvidence += 1;
        break;
      case "challenged":
        challenged += 1;
        break;
      case "archived":
        break; // archived claims are not part of the active profile
    }
  }
  return {
    supported,
    needEvidence,
    challenged,
    claims: supported + needEvidence + challenged,
    toInvestigate: needEvidence + challenged,
  };
}

/**
 * Derive the card's display status. Precedence: a stored `archived` project reads as Complete;
 * otherwise an open challenge makes it Needs attention; otherwise it is In progress.
 */
export function deriveDisplayStatus(
  storedStatus: string,
  health: ProjectHealth
): ProjectDisplayStatus {
  if (storedStatus === "archived") {
    return "complete";
  }
  if (health.challenged > 0) {
    return "needs_attention";
  }
  return "in_progress";
}

export type DisplayStatusMeta = { label: string; tone: TagTone };

export const DISPLAY_STATUS_META: Record<
  ProjectDisplayStatus,
  DisplayStatusMeta
> = {
  in_progress: { label: "In progress", tone: "blue" },
  needs_attention: { label: "Needs attention", tone: "orange" },
  complete: { label: "Complete", tone: "green" },
};

/** The health-bar segment colours, in display order (supported · need evidence · challenged). */
export const HEALTH_SEGMENT_COLORS = {
  supported: brand.tag.green.fg,
  needEvidence: brand.accent,
  challenged: brand.danger,
} as const;

/** A serializable project card for the list (Server Component → client filter/render). */
export type ProjectCardData = {
  id: string;
  name: string;
  /** "Lead engineer · Acme · Mar–Aug 2025" (empty parts dropped). */
  subtitle: string;
  status: ProjectDisplayStatus;
  sourceCount: number;
  health: ProjectHealth;
};
