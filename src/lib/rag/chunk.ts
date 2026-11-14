/**
 * Pure chunkers for the Evidence Search Pipeline.
 *
 * - `chunkReferenceItems` groups rows from the existing `reference_items` table into
 *   self-describing passages: O*NET rows collapse by occupation (SOC) into overview / tasks
 *   / skills / knowledge / abilities / activities sections; each Tech Fleet framework row
 *   becomes one "entity" chunk. This cuts ~316k raw rows to a few thousand chunks and makes
 *   each chunk stand alone (it starts with its title/code).
 * - `chunkEvidence` splits a user's evidence text into indexed passages.
 *
 * No IO and no SDK here — deterministic functions unit-tested with plain inputs (Humble
 * Object, CLAUDE.md §3). The boundary script and the evidence indexer feed these rows.
 */
import { createHash } from "node:crypto";
import type { RawReferenceRow, ReferenceChunk, EvidenceChunk } from "./types";

/** Stable content fingerprint so re-indexing can skip unchanged chunks (sha-256 hex). */
export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// ---------------------------------------------------------------------------
// Reference corpus
// ---------------------------------------------------------------------------

const FRAMEWORK_SOURCE = "techfleet-spf";
const ONET_SOURCE = "onet";

/** O*NET occupation sections and the `reference_items` entity_types that feed each one. */
const ONET_SECTIONS: { section: string; label: string; entities: string[] }[] =
  [
    { section: "tasks", label: "Tasks", entities: ["occupation_task"] },
    {
      section: "skills",
      label: "Skills",
      entities: ["occupation_skill", "occupation_transferable_skill"],
    },
    {
      section: "knowledge",
      label: "Knowledge",
      entities: ["occupation_knowledge"],
    },
    {
      section: "abilities",
      label: "Abilities",
      entities: ["occupation_ability"],
    },
    {
      section: "activities",
      label: "Work activities",
      entities: ["occupation_work_activity"],
    },
  ];
const ONET_ENTITY_TO_SECTION = new Map(
  ONET_SECTIONS.flatMap((s) => s.entities.map((e) => [e, s]))
);
/** Entity types that are reference-only scaffolding, not retrievable chunks. */
const ONET_SKIP = new Set(["content_model_element"]);
/** Cap items per section so one occupation can't produce an unbounded chunk. */
const MAX_ITEMS_PER_SECTION = 50;

/** The SOC occupation code a row belongs to: its own id for occupations, else the payload. */
export function onetSoc(row: RawReferenceRow): string {
  if (row.entity_type === "occupation") return row.external_id.trim();
  const code = row.payload["onetsoc_code"];
  return typeof code === "string" ? code.trim() : "";
}

const PAYLOAD_SKIP =
  /(^|_)(id|slug|url|external_id|version|code)($|_)|created|updated/i;

/**
 * Pull human-readable text out of a framework payload: top-level strings plus the `label` /
 * `name` of any nested objects (e.g. a specialization's task labels). Skips ids/slugs/urls.
 */
export function collectPayloadText(payload: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (PAYLOAD_SKIP.test(key)) continue;
    if (typeof value === "string") {
      const t = value.trim();
      if (t) out.push(t);
    } else if (Array.isArray(value)) {
      for (const el of value) {
        if (typeof el === "string") {
          const t = el.trim();
          if (t) out.push(t);
        } else if (el && typeof el === "object") {
          const label =
            (el as Record<string, unknown>).label ??
            (el as Record<string, unknown>).name;
          if (typeof label === "string" && label.trim()) out.push(label.trim());
        }
      }
    }
  }
  return out;
}

function dedup(items: string[]): string[] {
  return [...new Set(items.map((i) => i.trim()).filter(Boolean))];
}

function makeReferenceChunk(args: {
  id?: string;
  source: string;
  ref_id: string;
  ref_kind: string;
  section: string;
  title: string;
  content: string;
  source_version: string | null;
}): ReferenceChunk {
  return {
    id: args.id ?? `${args.source}:${args.ref_id}:${args.section}`,
    source: args.source,
    ref_id: args.ref_id,
    ref_kind: args.ref_kind,
    title: args.title,
    section: args.section,
    content: args.content,
    content_hash: sha256(args.content),
    source_version: args.source_version,
  };
}

function chunkFrameworkRow(row: RawReferenceRow): ReferenceChunk {
  const extras = dedup(collectPayloadText(row.payload)).filter(
    (t) => t !== row.name
  );
  const descr = row.description?.trim();
  const body = [descr, ...extras].filter(Boolean).join("; ");
  const content = body ? `${row.name} — ${body}` : row.name;
  return makeReferenceChunk({
    // entity_type is part of the id because a slug can repeat across framework entity types
    // (reference_items is unique on source+entity_type+external_id, not external_id alone).
    id: `${FRAMEWORK_SOURCE}:${row.entity_type}:${row.external_id}`,
    source: FRAMEWORK_SOURCE,
    ref_id: row.external_id,
    ref_kind: `framework_${row.entity_type}`,
    section: "entity",
    title: row.name,
    content,
    source_version: row.source_version,
  });
}

function chunkOnetOccupation(
  soc: string,
  rows: RawReferenceRow[]
): ReferenceChunk[] {
  const occupation = rows.find((r) => r.entity_type === "occupation");
  const title = occupation?.name?.trim() || soc;
  const version = occupation?.source_version ?? rows[0]?.source_version ?? null;
  const chunks: ReferenceChunk[] = [];

  // Overview from the occupation row's description.
  if (occupation) {
    const descr = occupation.description?.trim();
    const content = descr
      ? `${title} (${soc}). ${descr}`
      : `${title} (${soc}).`;
    chunks.push(
      makeReferenceChunk({
        source: ONET_SOURCE,
        ref_id: soc,
        ref_kind: "occupation",
        section: "overview",
        title,
        content,
        source_version: version,
      })
    );
  }

  // One chunk per section that has items.
  for (const def of ONET_SECTIONS) {
    const items = dedup(
      rows
        .filter((r) => def.entities.includes(r.entity_type))
        .map((r) => r.name)
    ).slice(0, MAX_ITEMS_PER_SECTION);
    if (items.length === 0) continue;
    chunks.push(
      makeReferenceChunk({
        source: ONET_SOURCE,
        ref_id: soc,
        ref_kind: "occupation",
        section: def.section,
        title,
        content: `${title} (${soc}) — ${def.label}: ${items.join("; ")}`,
        source_version: version,
      })
    );
  }
  return chunks;
}

/**
 * Turn a batch of `reference_items` rows into retrievable chunks. For correct O*NET
 * grouping, all rows for a given SOC must be present in the same call (the indexer flushes
 * per occupation). Unknown O*NET entity types and empty sections are skipped.
 */
export function chunkReferenceItems(rows: RawReferenceRow[]): ReferenceChunk[] {
  const chunks: ReferenceChunk[] = [];
  const onetBySoc = new Map<string, RawReferenceRow[]>();

  for (const row of rows) {
    if (row.source === FRAMEWORK_SOURCE) {
      if (row.name.trim()) chunks.push(chunkFrameworkRow(row));
      continue;
    }
    if (row.source === ONET_SOURCE) {
      if (ONET_SKIP.has(row.entity_type)) continue;
      if (
        row.entity_type !== "occupation" &&
        !ONET_ENTITY_TO_SECTION.has(row.entity_type)
      ) {
        continue; // unknown rated table we don't surface
      }
      const soc = onetSoc(row);
      if (!soc) continue;
      const bucket = onetBySoc.get(soc);
      if (bucket) bucket.push(row);
      else onetBySoc.set(soc, [row]);
    }
    // Other sources are ignored for v1.
  }

  for (const [soc, socRows] of onetBySoc) {
    chunks.push(...chunkOnetOccupation(soc, socRows));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Evidence corpus (per user)
// ---------------------------------------------------------------------------

/** Target characters per evidence chunk before a new one starts. */
export const EVIDENCE_CHUNK_CHARS = 1_500;

/**
 * Split text into ~`maxChars` passages on paragraph/line boundaries, hard-splitting any
 * single paragraph that is itself longer than the budget. Whitespace-only input yields none.
 */
export function splitText(
  text: string,
  maxChars = EVIDENCE_CHUNK_CHARS
): { chunk_index: number; content: string }[] {
  const paragraphs = text
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const pieces: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) pieces.push(current.trim());
    current = "";
  };

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      flush();
      for (let i = 0; i < para.length; i += maxChars) {
        pieces.push(para.slice(i, i + maxChars).trim());
      }
      continue;
    }
    if (current && current.length + 2 + para.length > maxChars) flush();
    current = current ? `${current}\n\n${para}` : para;
  }
  flush();

  return pieces.map((content, chunk_index) => ({ chunk_index, content }));
}

type EvidenceMeta =
  | { source_kind: "file"; file_id: string; title: string }
  | {
      source_kind: "decision_record";
      decision_record_id: string;
      title: string;
    };

/** Build per-user evidence chunks from text + its source metadata. */
export function chunkEvidence(
  text: string,
  meta: EvidenceMeta,
  maxChars = EVIDENCE_CHUNK_CHARS
): EvidenceChunk[] {
  return splitText(text, maxChars).map((piece) => ({
    source_kind: meta.source_kind,
    file_id: meta.source_kind === "file" ? meta.file_id : null,
    decision_record_id:
      meta.source_kind === "decision_record" ? meta.decision_record_id : null,
    title: meta.title,
    chunk_index: piece.chunk_index,
    content: piece.content,
    content_hash: sha256(piece.content),
  }));
}
