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

const PAGE = 5000;
const EMBED_BATCH = 100;

function env(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is not set (needed for the reference backfill).`);
  return value;
}

function str(value: unknown): string {
  return value == null ? "" : String(value);
}
function nullableStr(value: unknown): string | null {
  return value == null ? null : String(value);
}

/**
 * Paginate a PostgREST query, advancing by the number of rows actually returned so it works
 * whether or not the server caps the page size.
 */
async function paginate(
  build: (
    from: number,
    to: number
  ) => PromiseLike<{
    data: Record<string, unknown>[] | null;
    error: { message: string } | null;
  }>
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ;) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`reference_items read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    from += data.length;
    if (data.length < PAGE) break;
  }
  return rows;
}

/**
 * Load the corpus trimmed to only what the chunker reads. Framework rows (few) keep the full
 * payload (the chunker pulls labels from it); O*NET rows (~316k) fetch only name/description
 * plus the SOC code extracted server-side (`payload->>onetsoc_code`), so the large O*NET
 * payloads are never transferred — the whole reason the naive full-payload load timed out.
 */
async function loadAllRows(
  supabase: SupabaseClient
): Promise<RawReferenceRow[]> {
  const framework = await paginate((from, to) =>
    supabase
      .from("reference_items")
      .select(
        "source, entity_type, external_id, name, description, payload, source_version"
      )
      .eq("source", "techfleet-spf")
      .range(from, to)
  );
  const onet = await paginate((from, to) =>
    supabase
      .from("reference_items")
      .select(
        "entity_type, external_id, name, description, source_version, onetsoc_code:payload->>onetsoc_code"
      )
      .eq("source", "onet")
      .range(from, to)
  );

  const rows: RawReferenceRow[] = [];
  for (const r of framework) {
    rows.push({
      source: str(r.source),
      entity_type: str(r.entity_type),
      external_id: str(r.external_id),
      name: str(r.name),
      description: nullableStr(r.description),
      payload: (r.payload ?? {}) as Record<string, unknown>,
      source_version: nullableStr(r.source_version),
    });
  }
  for (const r of onet) {
    rows.push({
      source: "onet",
      entity_type: str(r.entity_type),
      external_id: str(r.external_id),
      name: str(r.name),
      description: nullableStr(r.description),
      payload:
        r.onetsoc_code == null ? {} : { onetsoc_code: str(r.onetsoc_code) },
      source_version: nullableStr(r.source_version),
    });
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
  const rawChunks = chunkReferenceItems(rows);
  // Defensive dedup by id: the upsert's ON CONFLICT (id) cannot touch the same id twice in
  // one batch, so two chunks that resolve to the same id would abort it. Chunk ids are unique
  // by construction; this is a belt-and-braces guard (keeps the last occurrence).
  const chunks = [...new Map(rawChunks.map((c) => [c.id, c])).values()];
  const dupes = rawChunks.length - chunks.length;
  console.log(
    `  ${chunks.length} chunks${dupes ? ` (${dupes} duplicate id(s) dropped)` : ""}`
  );

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
