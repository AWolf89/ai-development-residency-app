/**
 * The pure Investigation Queue assembler (MVP 2 Phase 3, §8). Turns the collected signals into a
 * prioritised, de-duplicated list of items. No IO and no `server-only` import, so it is unit-tested
 * with canned inputs (Humble Object, CLAUDE.md §3). Every item is derived from a real signal — the
 * queue never invents work (AC1/AC4): an empty signal set yields an empty queue.
 */
import {
  KIND_PRIORITY,
  type InvestigationItem,
  type InvestigationSignals,
  type MissingInfoSignal,
  type ReconciliationSignal,
} from "./types";

/** Deep-link for a missing-info item, by whichever subject it hangs off. */
function missingInfoHref(signal: MissingInfoSignal): {
  label: string;
  href: string;
} {
  if (signal.decisionRecordId) {
    return {
      label: "Open record",
      href: `/dashboard/decision-records/${signal.decisionRecordId}`,
    };
  }
  if (signal.roleRequirementId) {
    return { label: "Review gaps", href: "/dashboard/gap-check" };
  }
  // A claim subject (or none) routes to the profile where claims live.
  return { label: "Open profile", href: "/dashboard" };
}

/** A reconciliation conflict is an integrity item; a complementary match is a link suggestion. */
function reconciliationKind(
  signal: ReconciliationSignal
): "document_conflict" | "link_suggestion" {
  return signal.kind === "complementary"
    ? "link_suggestion"
    : "document_conflict";
}

/** Map every signal to an item, then sort (priority asc, newest first) and de-dup by id. */
export function buildQueue(signals: InvestigationSignals): InvestigationItem[] {
  const items: InvestigationItem[] = [];

  for (const r of signals.unverifiedRequirements) {
    items.push({
      id: `unverified_requirement:${r.requirementId}`,
      kind: "unverified_requirement",
      title: `“${r.label}” isn’t verified yet`,
      detail:
        r.verdict === "unknown"
          ? "No evidence was found for this requirement — investigate before treating it as a gap."
          : "Your evidence doesn’t yet cover this requirement.",
      subjectLabel: r.label,
      action: {
        label: "Investigate",
        href: `/dashboard/gap-check?role=${r.targetRoleId}`,
      },
      priority: KIND_PRIORITY.unverified_requirement,
      createdAt: r.updatedAt,
    });
  }

  for (const f of signals.overclaimFlags) {
    items.push({
      id: `overclaim_flag:${f.flagId}`,
      kind: "overclaim_flag",
      title: "A claim may be overstated",
      detail: f.message,
      subjectLabel: f.recordTitle,
      action: {
        label: "Review record",
        href: `/dashboard/decision-records/${f.decisionRecordId}/review`,
      },
      priority: KIND_PRIORITY.overclaim_flag,
      createdAt: f.createdAt,
    });
  }

  for (const c of signals.reconciliation) {
    const kind = reconciliationKind(c);
    items.push({
      id: `${kind}:${c.flagId}`,
      kind,
      title:
        kind === "document_conflict"
          ? "A new upload conflicts with your evidence"
          : "A new upload overlaps an existing record",
      detail: c.message,
      subjectLabel: c.fileName,
      action: {
        label:
          kind === "document_conflict" ? "Resolve conflict" : "Review overlap",
        href: `/dashboard/files/${c.fileId}`,
      },
      priority:
        kind === "document_conflict"
          ? KIND_PRIORITY.document_conflict
          : KIND_PRIORITY.link_suggestion,
      createdAt: c.createdAt,
    });
  }

  for (const c of signals.unsupportedClaims) {
    items.push({
      id: `unsupported_claim:${c.recordId}`,
      kind: "unsupported_claim",
      title: "A claim has no supporting evidence",
      detail: "Add a file or investigate so this claim can be defended.",
      subjectLabel: c.title,
      action: {
        label: "Open record",
        href: `/dashboard/decision-records/${c.recordId}`,
      },
      priority: KIND_PRIORITY.unsupported_claim,
    });
  }

  for (const m of signals.missingInfo) {
    items.push({
      id: `missing_info:${m.itemId}`,
      kind: "missing_info",
      title: "Missing information",
      detail: m.description,
      subjectLabel: m.description,
      action: missingInfoHref(m),
      priority: KIND_PRIORITY.missing_info,
      createdAt: m.createdAt,
    });
  }

  for (const f of signals.unreviewedFiles) {
    items.push({
      id: `unreviewed_file:${f.fileId}`,
      kind: "unreviewed_file",
      title: "A file hasn’t been reviewed",
      detail: "Analyse this upload so its evidence can be used.",
      subjectLabel: f.fileName,
      action: { label: "Open file", href: `/dashboard/files/${f.fileId}` },
      priority: KIND_PRIORITY.unreviewed_file,
    });
  }

  for (const s of signals.unfinishedInterviews) {
    items.push({
      id: `unfinished_interview:${s.sessionId}`,
      kind: "unfinished_interview",
      title: "An interview is unfinished",
      detail: "Pick up where you left off to capture the rest of the story.",
      subjectLabel: s.title ?? "Reasoning interview",
      action: { label: "Resume interview", href: "/dashboard/interview" },
      priority: KIND_PRIORITY.unfinished_interview,
      createdAt: s.updatedAt,
    });
  }

  // De-dup by derived id (a subject could surface the same signal twice), then order: priority
  // ascending, newest first within a priority, stable by id as a final tiebreak.
  const deduped = Array.from(new Map(items.map((i) => [i.id, i])).values());
  deduped.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const at = a.createdAt ?? "";
    const bt = b.createdAt ?? "";
    if (at !== bt) return at < bt ? 1 : -1; // newest first
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return deduped;
}

/** True when there is nothing outstanding — the honest empty state (AC4). */
export function isQueueEmpty(items: InvestigationItem[]): boolean {
  return items.length === 0;
}
