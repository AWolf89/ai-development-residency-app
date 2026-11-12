-- ---------------------------------------------------------------------------
-- Target Role & Job Description Intake (E-build 7): requirement provenance
-- + fast O*NET name lookup.
--
-- The existing role_requirements table (20261107202126_create_initial_schema.sql)
-- already has user_id / target_role_id / requirement_text / category with full
-- own-rows RLS. This migration records WHERE each requirement was mapped from and
-- links it to the matched reference row:
--   - source: 'framework' | 'onet' | 'job_description' (AC8 provenance label).
--   - reference_item_id: the matched reference_items row, when any.
--
-- Both new columns are NULLABLE so existing rows stay valid; the app's Zod layer
-- decides what is required for a confirmed save. A CHECK (not a Postgres enum)
-- mirrors how the rest of the schema models small closed sets as text.
--
-- RLS on role_requirements is unchanged (own-rows select/insert/update/delete),
-- which satisfies AC11. Adding columns does not alter those policies.
-- ---------------------------------------------------------------------------

alter table public.role_requirements
  add column if not exists source text,
  add column if not exists reference_item_id uuid
    references public.reference_items (id) on delete set null;

alter table public.role_requirements
  drop constraint if exists role_requirements_source_check;

alter table public.role_requirements
  add constraint role_requirements_source_check
  check (source is null or source in ('framework', 'onet', 'job_description'));

create index if not exists role_requirements_reference_item_id_idx
  on public.role_requirements (reference_item_id);

comment on column public.role_requirements.source is
  'Where this requirement was mapped from: framework | onet | job_description.';
comment on column public.role_requirements.reference_item_id is
  'The matched reference_items row (Skills & Practices Framework or O*NET), if any.';

-- ---------------------------------------------------------------------------
-- Fast O*NET-fallback name search over reference_items.
--
-- reference_items holds ~316k rows; matching a free-text requirement against
-- name with a plain ILIKE would scan the whole table. A trigram GIN index makes
-- case-insensitive substring / similarity search on name fast. pg_trgm ships
-- with Supabase Postgres; enabling it is idempotent.
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

create index if not exists reference_items_name_trgm_idx
  on public.reference_items using gin (name gin_trgm_ops);
