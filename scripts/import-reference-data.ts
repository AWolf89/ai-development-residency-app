/**
 * E4 reference-data importer (boundary / Humble Object).
 *
 * Reads the vendored Skills & Practices Framework JSON and (if present) the
 * user-provided O*NET text files, maps them with the pure functions in
 * src/lib/reference/*, and idempotently upserts them into `reference_items`.
 *
 * This is a one-off ops script, not app code. It uses the Supabase SECRET
 * (service-role) key, which bypasses Row Level Security, so it must only ever be
 * run locally/CI with a server-only key — never shipped to the browser.
 *
 * Usage:
 *   npm run reference:import            # framework + O*NET (if files present)
 *   npm run reference:import framework  # framework only
 *   npm run reference:import onet       # O*NET only
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  FRAMEWORK_ENTITIES,
  selectManifestEntities,
  mapFrameworkEntity,
  type FrameworkManifest,
} from "../src/lib/reference/framework";
import {
  parseOnetTsv,
  mapOnetRow,
  ONET_TABLES,
} from "../src/lib/reference/onet";
import type { ReferenceItem } from "../src/lib/reference/types";

const FRAMEWORK_DIR = join("data", "reference", "techfleet-spf");
const ONET_DIR = join("data", "reference", "onet");
const UPSERT_BATCH = 500;
const CONFLICT_TARGET = "source,entity_type,external_id";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function makeAdminClient(): SupabaseClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const secret = requireEnv("SUPABASE_SECRET_KEY");
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

async function upsertAll(
  db: SupabaseClient,
  items: ReferenceItem[]
): Promise<number> {
  let written = 0;
  for (let i = 0; i < items.length; i += UPSERT_BATCH) {
    const batch = items.slice(i, i + UPSERT_BATCH);
    const { error } = await db
      .from("reference_items")
      .upsert(batch, { onConflict: CONFLICT_TARGET });
    if (error) throw new Error(`upsert failed: ${error.message}`);
    written += batch.length;
  }
  return written;
}

async function importFramework(db: SupabaseClient): Promise<void> {
  const manifest = readJson<FrameworkManifest>(
    join(FRAMEWORK_DIR, "manifest.json")
  );
  const entities = selectManifestEntities(manifest, FRAMEWORK_ENTITIES);
  console.log(
    `Framework ${manifest.version}: loading ${entities.length} entities`
  );

  for (const entity of entities) {
    const file = join(FRAMEWORK_DIR, entity.file);
    const records = readJson<Record<string, unknown>[]>(file);
    const items = mapFrameworkEntity(entity, records, manifest.version);
    const written = await upsertAll(db, items);
    console.log(`  ${entity.entity}: ${written}`);
  }
}

async function importOnet(db: SupabaseClient): Promise<void> {
  if (!existsSync(ONET_DIR) || readdirSync(ONET_DIR).length === 0) {
    console.log(
      `O*NET: no files in ${ONET_DIR} — skipping (see data/reference/onet/README.md).`
    );
    return;
  }
  const release = process.env.ONET_RELEASE?.trim() || null;
  console.log(`O*NET${release ? ` ${release}` : ""}: importing curated subset`);

  for (const config of ONET_TABLES) {
    const file = join(ONET_DIR, config.file);
    if (!existsSync(file)) {
      console.log(`  ${config.file}: not found — skipped`);
      continue;
    }
    const rows = parseOnetTsv(readFileSync(file, "utf-8"));
    const items = rows.map((row) => mapOnetRow(config, row, release));
    const written = await upsertAll(db, items);
    console.log(`  ${config.entityType}: ${written}`);
  }
}

async function main(): Promise<void> {
  const which = process.argv[2] ?? "all";
  const db = makeAdminClient();

  if (which === "all" || which === "framework") await importFramework(db);
  if (which === "all" || which === "onet") await importOnet(db);

  console.log("Reference import complete.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
