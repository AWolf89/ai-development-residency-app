-- Cross-document reconciliation flags (MVP 2 Phase 2, ADR-0023).
--
-- At ingest, the agent compares a new upload against the user's existing evidence
-- and records contradictions (a date / metric / ownership disagreement) and
-- complementary matches here. A flag is two-sided: it cites BOTH the new file and
-- the conflicting existing source, and carries its own disposition
-- (pending → accepted / dismissed), distinct from the one-sided
-- "what is unknown" of missing_info_items. It is written only on an explicit user
-- decision (HITL, ADR-0013). Own-rows RLS throughout. Additive migration.
create table public.reconciliation_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The newly-ingested file whose analysis produced this flag.
  file_id uuid not null references public.files (id) on delete cascade,
  -- The nature of the finding. 'complementary' = same subject, safe to link (not a conflict).
  kind text not null check (kind in ('date', 'metric', 'ownership', 'complementary')),
  -- A one-sentence description of the finding, shown to the user.
  message text not null,
  -- The disagreeing values as surfaced (NULL for a complementary match with no value delta).
  new_value text,
  existing_value text,
  -- Validated citations [{source, id, title}] pointing at really-retrieved evidence: the new
  -- file and the conflicting/complementary existing source. The app guarantees a flag never
  -- cites un-retrieved evidence (mirrors record_review_flags).
  citations jsonb not null default '[]'::jsonb,
  disposition text not null default 'pending'
    check (disposition in ('pending', 'accepted', 'dismissed')),
  model_used text,
  prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reconciliation_flags_user_id_idx on public.reconciliation_flags (user_id);
create index reconciliation_flags_file_id_idx on public.reconciliation_flags (file_id);

alter table public.reconciliation_flags enable row level security;

-- Own-rows policies (mirror missing_info_items / record_review_flags): a user sees and changes
-- only their own flags, and on insert the referenced file must also be theirs, so a flag can
-- never be hung off another user's file even though own-rows alone would allow the user_id.
create policy "Users read own reconciliation_flags" on public.reconciliation_flags for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own reconciliation_flags" on public.reconciliation_flags for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.files f
      where f.id = file_id and f.user_id = (select auth.uid())
    )
  );
create policy "Users update own reconciliation_flags" on public.reconciliation_flags for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete own reconciliation_flags" on public.reconciliation_flags for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger reconciliation_flags_set_updated_at before update on public.reconciliation_flags
  for each row execute function public.set_updated_at();

comment on table public.reconciliation_flags is
  'Cross-document reconciliation findings at ingest (ADR-0023): two-sided conflicts (date/metric/ownership) and complementary matches, each citing both sources, with a pending/accepted/dismissed disposition. Written only on explicit user decision (HITL). Distinct from missing_info_items (one-sided "what is unknown").';
