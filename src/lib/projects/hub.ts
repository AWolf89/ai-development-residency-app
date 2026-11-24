/**
 * Pure assembly of the Project Workspace hub (MVP 2 Phase 3, plan §6.2; Figma detail frame).
 * Turns a project's linked rows — files, decision records, learning moments, and the claims that
 * project over those records (ADR-0022) — into the hub's sections: health, skills, evidence,
 * decisions, outcomes, learning, claims, and open questions. No IO and no React, so every branch
 * is unit-tested with canned rows (Humble Object, CLAUDE.md §3). Sections reflect only real rows
 * (AC2): an empty project yields empty sections and no open questions.
 */
import { categoryLabel } from "@/lib/claims/presentation";
import type { ClaimCategory } from "@/lib/claims/types";
import type { ClaimLifecycleState } from "@/lib/claims/lifecycle";
import type { ProjectView } from "./mappers";
import {
  claimBadge,
  computeProjectHealth,
  deriveDisplayStatus,
  type ClaimBadge,
  type ProjectDisplayStatus,
  type ProjectHealth,
} from "./health";

// ── Raw inputs (the query fills these; the assembler stays pure) ─────────────────────────────

export type HubRecordInput = {
  id: string;
  title: string;
  decision: string | null;
  outcome: string | null;
  category: string | null;
};

export type HubClaimInput = {
  /** The backing decision record's id (ADR-0022: a claim's id is that record's id). */
  id: string;
  title: string;
  lifecycle: ClaimLifecycleState;
};

export type ProjectHubInput = {
  project: ProjectView;
  files: { id: string; file_name: string; caption: string | null }[];
  records: HubRecordInput[];
  moments: { id: string; kind: string }[];
  claims: HubClaimInput[];
};

// ── The assembled view-model ─────────────────────────────────────────────────────────────────

export type HubFile = { id: string; name: string; caption: string | null };
export type HubDecision = { id: string; title: string; decision: string };
export type HubOutcome = { id: string; title: string; outcome: string };
export type HubClaim = { id: string; title: string; badge: ClaimBadge };
export type HubOpenQuestion = { id: string; text: string; href: string };

export type ProjectHub = {
  project: ProjectView;
  status: ProjectDisplayStatus;
  health: ProjectHealth;
  sourceCount: number;
  /** Distinct record categories, as human labels. */
  skills: string[];
  files: HubFile[];
  decisions: HubDecision[];
  outcomes: HubOutcome[];
  moments: { id: string; kind: string }[];
  claims: HubClaim[];
  openQuestions: HubOpenQuestion[];
};

function hasText(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

const CLAIM_CATEGORY_VALUES = new Set<ClaimCategory>([
  "leadership",
  "delivery",
  "stakeholders",
  "technical",
]);

function recordHref(id: string): string {
  return `/dashboard/decision-records/${id}`;
}

/** Assemble the hub view-model from a project and its linked rows. */
export function assembleProjectHub(input: ProjectHubInput): ProjectHub {
  const health = computeProjectHealth(input.claims.map((c) => c.lifecycle));
  const status = deriveDisplayStatus(input.project.status, health);

  // Skills: distinct, known record categories as labels (grounded — never invented).
  const seen = new Set<ClaimCategory>();
  const skills: string[] = [];
  for (const record of input.records) {
    const category = record.category as ClaimCategory | null;
    if (
      category &&
      CLAIM_CATEGORY_VALUES.has(category) &&
      !seen.has(category)
    ) {
      seen.add(category);
      skills.push(categoryLabel(category));
    }
  }

  const files: HubFile[] = input.files.map((f) => ({
    id: f.id,
    name: f.file_name,
    caption: f.caption,
  }));

  const decisions: HubDecision[] = input.records
    .filter((r) => hasText(r.decision))
    .map((r) => ({ id: r.id, title: r.title, decision: r.decision as string }));

  const outcomes: HubOutcome[] = input.records
    .filter((r) => hasText(r.outcome))
    .map((r) => ({ id: r.id, title: r.title, outcome: r.outcome as string }));

  const claims: HubClaim[] = input.claims.map((c) => ({
    id: c.id,
    title: c.title,
    badge: claimBadge(c.lifecycle),
  }));

  // Open questions (link into investigation): a record with no recorded outcome, and any
  // challenged claim. These are the project-local signals the Investigation Queue also surfaces.
  const openQuestions: HubOpenQuestion[] = [];
  for (const record of input.records) {
    if (!hasText(record.outcome)) {
      openQuestions.push({
        id: `outcome:${record.id}`,
        text: `“${record.title}” — outcome not recorded yet`,
        href: recordHref(record.id),
      });
    }
  }
  for (const claim of claims) {
    if (claim.badge === "challenged") {
      openQuestions.push({
        id: `challenged:${claim.id}`,
        text: `“${claim.title}” is challenged — reconcile it`,
        href: recordHref(claim.id),
      });
    }
  }

  return {
    project: input.project,
    status,
    health,
    sourceCount: files.length,
    skills,
    files,
    decisions,
    outcomes,
    moments: input.moments.map((m) => ({ id: m.id, kind: m.kind })),
    claims,
    openQuestions,
  };
}
