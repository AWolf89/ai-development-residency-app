/**
 * Pure assembly of a project's detail view: the project plus its three linked
 * evidence groups (files, decision records, learning moments) and their counts.
 *
 * Humble Object: the thin query (`queries.ts`) runs the RLS-scoped selects and
 * hands the raw rows here; this function does the shaping, so the aggregation is
 * unit-testable with canned rows and no network.
 */
import {
  mapProjectRowToView,
  formatLinkCounts,
  type ProjectRow,
  type ProjectView,
  type ProjectLinkCounts,
} from "./mappers";

export type ProjectDetailFile = {
  id: string;
  name: string;
  caption: string | null;
};
export type ProjectDetailRecord = { id: string; title: string };
export type ProjectDetailMoment = { id: string; kind: string };

type RawFile = { id: string; file_name: string; caption: string | null };
type RawRecord = { id: string; title: string };
type RawMoment = { id: string; kind: string };

export type ProjectDetail = {
  project: ProjectView;
  files: ProjectDetailFile[];
  records: ProjectDetailRecord[];
  moments: ProjectDetailMoment[];
  counts: ProjectLinkCounts;
  countsLabel: string;
};

export function assembleProjectDetail(input: {
  project: ProjectRow;
  files: RawFile[];
  records: RawRecord[];
  moments: RawMoment[];
}): ProjectDetail {
  const files = input.files.map((f) => ({
    id: f.id,
    name: f.file_name,
    caption: f.caption,
  }));
  const records = input.records.map((r) => ({ id: r.id, title: r.title }));
  const moments = input.moments.map((m) => ({ id: m.id, kind: m.kind }));

  const counts: ProjectLinkCounts = {
    files: files.length,
    records: records.length,
    moments: moments.length,
  };

  return {
    project: mapProjectRowToView(input.project),
    files,
    records,
    moments,
    counts,
    countsLabel: formatLinkCounts(counts),
  };
}
