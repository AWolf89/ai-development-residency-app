/**
 * Pure project-timeline logic for the Decision-Point Interview (ADR-0021).
 *
 * `draftTimeline` turns a project's files into an ordered list of decision points the
 * interview anchors its questions to. It is deliberately free of Supabase and the AI SDK —
 * it takes plain `TimelineFile` rows and returns plain data — so it is unit-tested with
 * canned inputs to 100% (Humble Object, CLAUDE.md §3). The orchestrator fetches the files
 * and persists the user-corrected result; nothing here reaches the network.
 *
 * Honesty (ADR-0021): dates come from the file's upload time and labels from its filename,
 * both of which are only a guess. The interview MUST let the user correct the draft before
 * asking anything, and nothing is invented — a file with no usable date is simply left out
 * of the draft (the user can add it by hand), and an empty draft drives the manual fallback.
 */
import { z } from "zod";

/** One point on the project timeline: a decision moment backed by one or more files. */
export const timelineEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1),
  /** ISO date string, or null for a manually-added point with no known date. */
  date: z.string().nullable(),
  /** The files that evidence this point (may be empty for a manual entry). */
  fileIds: z.array(z.string()),
  /** A detected version progression (e.g. "v1→v3"), or null when none was found. */
  versionHint: z.string().nullable(),
});
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;

/** A whole timeline: decision points in chronological order. */
export const timelineSchema = z.array(timelineEntrySchema);
export type Timeline = z.infer<typeof timelineSchema>;

/** The minimal file shape the drafter needs — decoupled from the `files` row on purpose. */
export type TimelineFile = {
  id: string;
  name: string;
  createdAt: string | null;
};

/** True when a value parses as a real date — the "usable date" test for AC1/AC6. */
export function isUsableDate(value: string | null | undefined): boolean {
  if (!value) return false;
  return !Number.isNaN(Date.parse(value));
}

const VERSION_RE = /\b(v\d+|rev\.?\s?\d+|r\d+|draft|final|fin)\b/i;
// Matches date tokens AFTER separators have been normalised to single spaces.
const DATE_TOKEN_RE = /\b(\d{4} \d{2} \d{2}|\d{1,2} \d{1,2} \d{2,4})\b/g;

/** Detect a version marker in a filename, normalised (e.g. "Rev 2" → "rev2"), or null. */
export function parseVersionHint(name: string): string | null {
  // Normalise `_`/`-` to spaces first so a marker like `plan_v2` has a word boundary.
  const normalised = name.replace(/\.[a-z0-9]+$/i, "").replace(/[_\-]+/g, " ");
  const match = normalised.match(VERSION_RE);
  if (!match) return null;
  return match[1].toLowerCase().replace(/[.\s]/g, "");
}

/** Strip extension, date tokens, separators, and version markers to a stable grouping key. */
export function cleanBaseName(name: string): string {
  const base = name
    .replace(/\.[a-z0-9]+$/i, "")
    // Normalise all separators to spaces so date and version tokens gain word boundaries.
    .replace(/[_\-.]+/g, " ")
    .replace(DATE_TOKEN_RE, " ")
    .replace(VERSION_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return base;
}

/** Title-case a cleaned base name for display ("migration plan" → "Migration Plan"). */
function toLabel(base: string, fallback: string): string {
  if (base === "") return fallback.replace(/\.[a-z0-9]+$/i, "");
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Order version tokens so numbered versions sort naturally (v1 < v2 < v10). */
function sortVersions(tokens: string[]): string[] {
  const num = (t: string) => {
    const m = t.match(/\d+/);
    return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
  };
  return [...tokens].sort((a, b) => num(a) - num(b) || a.localeCompare(b));
}

/**
 * Draft a chronological timeline from a project's files (AC1). Files that share a cleaned
 * base name are grouped as revisions of one decision point; files without a usable date are
 * excluded. Returns an empty timeline when no file has a usable date, which the UI turns into
 * the manual-entry fallback (AC6).
 */
export function draftTimeline(files: TimelineFile[]): Timeline {
  const dated = files.filter((f) => isUsableDate(f.createdAt));
  if (dated.length === 0) return [];

  type Group = {
    label: string;
    fileIds: string[];
    versions: string[];
    earliest: string;
  };
  const groups = new Map<string, Group>();

  for (const file of dated) {
    const date = file.createdAt as string;
    const base = cleanBaseName(file.name);
    const key = base === "" ? `__file__${file.id}` : base;
    const version = parseVersionHint(file.name);
    const existing = groups.get(key);
    if (existing) {
      existing.fileIds.push(file.id);
      if (version) existing.versions.push(version);
      if (Date.parse(date) < Date.parse(existing.earliest)) {
        existing.earliest = date;
      }
    } else {
      groups.set(key, {
        label: toLabel(base, file.name),
        fileIds: [file.id],
        versions: version ? [version] : [],
        earliest: date,
      });
    }
  }

  return [...groups.values()]
    .sort((a, b) => Date.parse(a.earliest) - Date.parse(b.earliest))
    .map((g, index) => {
      const versions = sortVersions([...new Set(g.versions)]);
      return {
        id: `entry-${index}`,
        label: g.label,
        date: g.earliest,
        fileIds: g.fileIds,
        versionHint: versions.length > 0 ? versions.join("→") : null,
      };
    });
}
