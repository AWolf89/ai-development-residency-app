-- ADR-0020 · File Analysis & Tagging.
--
-- Per-user links from an uploaded file to the career-framework / O*NET items it evidences
-- (the `reference_items` vocabulary: skills, practices, deliverables, milestones, ...). Written
-- only when the user accepts an analysis proposal; the accepted tags are also folded into the
-- evidence index so the Gap Check retrieves and cites the file.
--
-- This is per-user data (like files and decision_records), so it carries user_id and own-rows
-- RLS. reference_item_id points at the shared, read-only reference table (ADR-0008).

create table public.file_reference_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_id uuid not null references public.files (id) on delete cascade,
  -- the framework / O*NET item this file evidences (shared reference data).
  reference_item_id uuid not null references public.reference_items (id) on delete cascade,
  -- denormalised for grouping/display ("all skills for this file") without a join.
  entity_type text not null,
  -- the analysis's self-reported confidence for this tag.
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  -- why the analysis proposed this tag (shown to the user; provenance).
  rationale text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- one current tag per (file, reference item): the idempotent upsert key.
  constraint file_reference_tags_file_item_key unique (file_id, reference_item_id)
);

create index file_reference_tags_user_id_idx
  on public.file_reference_tags (user_id);
create index file_reference_tags_file_id_idx
  on public.file_reference_tags (file_id);
create index file_reference_tags_reference_item_id_idx
  on public.file_reference_tags (reference_item_id);

-- Keep updated_at current on every UPDATE (re-uses the helper from the initial schema).
create trigger file_reference_tags_set_updated_at
  before update on public.file_reference_tags
  for each row execute function public.set_updated_at();

-- Row-level security: a user reads and writes only their own tags.
alter table public.file_reference_tags enable row level security;

create policy "Users read own file_reference_tags"
  on public.file_reference_tags for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own file_reference_tags"
  on public.file_reference_tags for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own file_reference_tags"
  on public.file_reference_tags for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own file_reference_tags"
  on public.file_reference_tags for delete to authenticated
  using ((select auth.uid()) = user_id);
