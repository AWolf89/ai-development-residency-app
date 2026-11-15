-- ---------------------------------------------------------------------------
-- requirement_gap_assessments — Gap Classification (build order 10, ADR-0011).
-- One current grounded verdict per role requirement for a user's target role.
-- Additive only: no existing table or policy is changed.
-- ---------------------------------------------------------------------------
create table public.requirement_gap_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- One current assessment per requirement (the save path upserts on this key).
  role_requirement_id uuid not null unique references public.role_requirements (id) on delete cascade,
  target_role_id uuid not null references public.target_roles (id) on delete cascade,
  -- Four-verdict taxonomy (ADR-0011): unknown = no evidence retrieved to judge.
  verdict text not null check (verdict in ('met', 'partial', 'gap', 'unknown')),
  rationale text not null,
  -- Validated citations [{source, id, title}]; only sources that were really retrieved.
  citations jsonb not null default '[]'::jsonb,
  evidence_found boolean not null,
  model_used text,
  prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requirement_gap_assessments_user_id_idx
  on public.requirement_gap_assessments (user_id);
create index requirement_gap_assessments_target_role_id_idx
  on public.requirement_gap_assessments (target_role_id);

alter table public.requirement_gap_assessments enable row level security;

create policy "Users read own requirement_gap_assessments" on public.requirement_gap_assessments for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own requirement_gap_assessments" on public.requirement_gap_assessments for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own requirement_gap_assessments" on public.requirement_gap_assessments for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own requirement_gap_assessments" on public.requirement_gap_assessments for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger requirement_gap_assessments_set_updated_at before update on public.requirement_gap_assessments
  for each row execute function public.set_updated_at();
