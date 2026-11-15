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
// pgvector index maintenance makes large vector upserts heavy, so keep each write small enough
// to stay under the server statement timeout, and retry transient timeouts with backoff.
const UPSERT_BATCH = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Upsert one batch of chunks into reference_chunks, retrying transient errors with backoff. */
async function upsertChunks(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
  attempts = 5
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const { error } = await supabase
      .from("reference_chunks")
      .upsert(rows, { onConflict: "id" });
    if (!error) return;
    if (attempt >= attempts) {
      throw new Error(
        `reference_chunks upsert failed after ${attempts} attempts: ${error.message}`
      );
    }
    await sleep(1000 * attempt); // 1s, 2s, 3s, 4s backoff
  }
}

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

type Queryable = {
  order: (col: string, opts?: { ascending?: boolean }) => Queryable;
  limit: (n: number) => Queryable;
  gt: (col: string, value: string) => Queryable;
} & PromiseLike<{
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
}>;

/**
 * Keyset-paginate a PostgREST query over the whole table on the `id` primary key.
 *
 * OFFSET/`range` paging does not work here at corpus scale: PostgREST caps each response at
 * ~1000 rows regardless of the requested span, and deep OFFSETs over the ~316k O*NET rows re-scan
 * and discard every skipped row, blowing the statement timeout. Keyset paging (`order(id)` +
 * `gt(id, cursor)`) rides the primary-key index, so each page costs the same no matter how deep,
 * and the strictly-increasing cursor makes it gap-free and duplicate-free. `makeQuery` must
 * return a fresh query (with its select + filters) each call and its select must include `id`.
 */
async function paginate(
  makeQuery: () => Queryable
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (;;) {
    let q = makeQuery().order("id", { ascending: true }).limit(PAGE);
    if (cursor !== null) q = q.gt("id", cursor);
    const { data, error } = await q;
    if (error) throw new Error(`reference_items read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    cursor = String(data[data.length - 1].id);
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
  const framework = await paginate(
    () =>
      supabase
        .from("reference_items")
        .select(
          "id, source, entity_type, external_id, name, description, payload, source_version"
        )
        .eq("source", "techfleet-spf") as unknown as Queryable
  );
  const onet = await paginate(
    () =>
      supabase
        .from("reference_items")
        .select(
          "id, entity_type, external_id, name, description, source_version, onetsoc_code:payload->>onetsoc_code"
        )
        .eq("source", "onet") as unknown as Queryable
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
  let cursor: string | null = null;
  for (;;) {
    let q = supabase
      .from("reference_chunks")
      .select("id, content_hash")
      .order("id", { ascending: true })
      .limit(PAGE);
    if (cursor !== null) q = q.gt("id", cursor);
    const { data, error } = await q;
    if (error)
      throw new Error(`reference_chunks read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data)
      hashes.set(String(row.id), String(row.content_hash));
    cursor = String(data[data.length - 1].id);
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
    for (let k = 0; k < payload.length; k += UPSERT_BATCH) {
      await upsertChunks(supabase, payload.slice(k, k + UPSERT_BATCH));
    }
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
