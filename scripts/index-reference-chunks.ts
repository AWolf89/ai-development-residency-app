/**
 * Reference-corpus backfill for the Evidence Search Pipeline (ADR-0010, build order 8).
 *
 * Reads the existing `reference_items` rows (Tech Fleet SPF + O*NET), groups them into
 * chunks with the pure chunker (src/lib/rag/chunk.ts), embeds only the chunks whose content
 * changed (content_hash diff — no wasted embedding cost), and upserts them into
 * `reference_chunks`. This is a one-off ops script, not app code: it uses the Supabase SECRET
 * (service-role) key, which bypasses Row Level Security, so run it only locally / in CI.
 *
 * Run (note the react-server condition, needed because the embed gateway is server-only):
 *   npm run rag:index -- --dry-run              # show counts, write nothing (do this first)
 *   npm run rag:index                           # embed changed chunks + upsert
 *   npm run rag:index -- --prune --yes          # also delete chunks no longer produced
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, OPENROUTER_API_KEY.
 * Memory note: O*NET attribute payloads are trimmed to the SOC code before buffering, so the
 * whole corpus groups in memory without holding ~316k full rows.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chunkReferenceItems } from "../src/lib/rag/chunk";
import { embedBatch } from "../src/lib/llm/embed";
import type { RawReferenceRow, ReferenceChunk } from "../src/lib/rag/types";

const PAGE = 1000;
const EMBED_BATCH = 100;

function env(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is not set (needed for the reference backfill).`);
  return value;
}

/** Trim a raw row to only what the chunker reads, to keep the whole corpus in memory. */
function slim(row: Record<string, unknown>): RawReferenceRow {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const source = String(row.source);
  // Framework chunks read the full payload (labels etc.); O*NET reads only the SOC code.
  const slimPayload =
    source === "onet" && row.entity_type !== "occupation"
      ? { onetsoc_code: payload["onetsoc_code"] }
      : payload;
  return {
    source,
    entity_type: String(row.entity_type),
    external_id: String(row.external_id),
    name: String(row.name ?? ""),
    description: row.description == null ? null : String(row.description),
    payload: slimPayload,
    source_version:
      row.source_version == null ? null : String(row.source_version),
  };
}

async function loadAllRows(
  supabase: SupabaseClient
): Promise<RawReferenceRow[]> {
  const rows: RawReferenceRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("reference_items")
      .select(
        "source, entity_type, external_id, name, description, payload, source_version"
      )
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`reference_items read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) rows.push(slim(row));
    if (data.length < PAGE) break;
  }
  return rows;
}

async function loadExistingHashes(
  supabase: SupabaseClient
): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("reference_chunks")
      .select("id, content_hash")
      .range(from, from + PAGE - 1);
    if (error)
      throw new Error(`reference_chunks read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data)
      hashes.set(String(row.id), String(row.content_hash));
    if (data.length < PAGE) break;
  }
  return hashes;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const prune = args.has("--prune");
  const confirmed = args.has("--yes");

  const supabase = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SECRET_KEY"),
    {
      auth: { persistSession: false },
    }
  );

  console.log("Reading reference_items …");
  const rows = await loadAllRows(supabase);
  console.log(`  ${rows.length} rows`);

  console.log("Chunking …");
  const chunks = chunkReferenceItems(rows);
  console.log(`  ${chunks.length} chunks`);

  const existing = await loadExistingHashes(supabase);
  const changed: ReferenceChunk[] = chunks.filter(
    (c) => existing.get(c.id) !== c.content_hash
  );
  const liveIds = new Set(chunks.map((c) => c.id));
  const stale = [...existing.keys()].filter((id) => !liveIds.has(id));

  console.log(
    `New/changed: ${changed.length} · Unchanged: ${chunks.length - changed.length} · Stale: ${stale.length}`
  );

  if (dryRun) {
    console.log("Dry run — nothing written.");
    return;
  }

  // Embed changed chunks in batches, then upsert.
  let done = 0;
  for (let i = 0; i < changed.length; i += EMBED_BATCH) {
    const batch = changed.slice(i, i + EMBED_BATCH);
    const vectors = await embedBatch(batch.map((c) => c.content));
    const payload = batch.map((c, j) => ({
      id: c.id,
      source: c.source,
      ref_id: c.ref_id,
      ref_kind: c.ref_kind,
      title: c.title,
      section: c.section,
      content: c.content,
      content_hash: c.content_hash,
      source_version: c.source_version,
      embedding: JSON.stringify(vectors[j]),
    }));
    const { error } = await supabase
      .from("reference_chunks")
      .upsert(payload, { onConflict: "id" });
    if (error)
      throw new Error(`reference_chunks upsert failed: ${error.message}`);
    done += batch.length;
    console.log(`  embedded + upserted ${done}/${changed.length}`);
  }

  if (prune && stale.length > 0) {
    if (!confirmed) {
      console.log(
        `Refusing to delete ${stale.length} stale chunks without --yes.`
      );
    } else {
      const { error } = await supabase
        .from("reference_chunks")
        .delete()
        .in("id", stale);
      if (error)
        throw new Error(`reference_chunks prune failed: ${error.message}`);
      console.log(`Pruned ${stale.length} stale chunks.`);
    }
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
