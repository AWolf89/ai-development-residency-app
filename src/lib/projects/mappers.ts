/**
 * Pure mapping between a `projects` row and the view model the UI renders (and
 * the reverse: a validated input to the write row), plus deterministic,
 * locale-independent label helpers. Kept separate from the Server Component
 * (Humble Object) so every branch is unit-testable with no network.
 */
import type { ProjectInput } from "./validation";

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

/** The shape written to the `projects` table (no id / timestamps). */
export type ProjectWriteRow = {
  user_id: string;
  name: string;
  role: string | null;
  organisation: string | null;
  summary: string | null;
  status: string;
  started_on: string | null;
  ended_on: string | null;
};

/** Map a validated project input + the server-resolved user id to a write row. */
export function mapProjectInputToRow(
  value: ProjectInput,
  userId: string
): ProjectWriteRow {
  return {
    user_id: userId,
    name: value.name,
    role: value.role,
    organisation: value.organisation,
    summary: value.summary,
    status: value.status,
    started_on: value.startedOn,
    ended_on: value.endedOn,
  };
}

/** Counts of the three evidence types linked to a project. */
export type ProjectLinkCounts = {
  files: number;
  records: number;
  moments: number;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
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
