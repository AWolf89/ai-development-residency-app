/**
 * Pure mapping from a `projects` row to the view model the UI renders, plus
 * deterministic, locale-independent label helpers. Kept separate from the Server
 * Component (Humble Object) so every branch is unit-testable with no network.
 */

export type ProjectRow = {
  id: string;
  name: string;
  role: string | null;
  organisation: string | null;
  summary: string | null;
  status: string;
  started_on: string | null;
  ended_on: string | null;
  created_at: string;
};

export type ProjectView = {
  id: string;
  name: string;
  role: string | null;
  organisation: string | null;
  summary: string | null;
  status: string;
  dateRangeLabel: string;
  createdAt: string;
};

/** Counts of the three evidence types linked to a project. */
export type ProjectLinkCounts = {
  files: number;
  records: number;
  moments: number;
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "2024-01-15" -> "Jan 2024". Assumes a valid ISO date (validated on write). */
function formatMonthYear(iso: string): string {
  const [year, month] = iso.split("-");
  const label = MONTHS[Number(month) - 1];
  return `${label} ${year}`;
}

/**
 * A human label for a project's span: a full range, an open "Since …", an open
 * "Until …", or "" when no dates are set.
 */
export function formatDateRange(
  startedOn: string | null,
  endedOn: string | null
): string {
  if (startedOn && endedOn) {
    return `${formatMonthYear(startedOn)} – ${formatMonthYear(endedOn)}`;
  }
  if (startedOn) {
    return `Since ${formatMonthYear(startedOn)}`;
  }
  if (endedOn) {
    return `Until ${formatMonthYear(endedOn)}`;
  }
  return "";
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** "3 files · 2 records · 4 moments" (singular when a count is 1). */
export function formatLinkCounts(counts: ProjectLinkCounts): string {
  return [
    pluralize(counts.files, "file"),
    pluralize(counts.records, "record"),
    pluralize(counts.moments, "moment"),
  ].join(" · ");
}

export function mapProjectRowToView(row: ProjectRow): ProjectView {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    organisation: row.organisation,
    summary: row.summary,
    status: row.status,
    dateRangeLabel: formatDateRange(row.started_on, row.ended_on),
    createdAt: row.created_at,
  };
}
