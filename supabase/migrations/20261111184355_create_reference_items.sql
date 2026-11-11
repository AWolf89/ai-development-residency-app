-- E4 · Reference data layer.
--
-- A single read-only reference table that holds career-framework reference data
-- from more than one source (the Tech Fleet Skills & Practices Framework and
-- O*NET). It is NOT per-user data: every signed-in user reads the same rows, and
-- no user may write them. Writes happen only through the import script, which
-- uses the service-role key and so bypasses row-level security.
--
-- One generic table (source + entity_type + payload jsonb) rather than a table
-- per entity: this is reference material we look things up in, not relational
-- state the app mutates. See ADR-0008.

create table public.reference_items (
  id uuid primary key default gen_random_uuid(),
  -- which dataset this row came from, e.g. 'techfleet-spf' or 'onet'.
  source text not null,
  -- the kind of thing within that source, e.g. 'skill', 'practice', 'occupation'.
  entity_type text not null,
  -- the source's own identifier for the row (framework id/slug, O*NET code).
  external_id text not null,
  -- human-readable display name (the source's primary field).
  name text not null,
  -- short description where the source provides one.
  description text,
  -- the full source record, so relations and O*NET ratings are preserved.
  payload jsonb not null default '{}'::jsonb,
  -- provenance: framework version or O*NET release the row was imported from.
  source_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- the idempotent upsert key: re-running the importer updates in place.
  constraint reference_items_source_entity_external_key
    unique (source, entity_type, external_id)
);

-- Lookups are almost always "give me everything of this kind from this source".
create index reference_items_source_entity_idx
  on public.reference_items (source, entity_type);

-- Keep updated_at current on every UPDATE (re-uses the helper from the initial
-- schema migration).
create trigger reference_items_set_updated_at
  before update on public.reference_items
  for each row execute function public.set_updated_at();

-- Row-level security: read-only reference data.
alter table public.reference_items enable row level security;

-- Any signed-in user may read reference data.
create policy "Authenticated users read reference_items"
  on public.reference_items for select to authenticated
  using (true);

-- Deliberately NO insert/update/delete policies: with RLS enabled and no
-- write policy, the anon and authenticated roles cannot write these rows.
-- The import script uses the service-role key, which bypasses RLS.
