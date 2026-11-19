-- ---------------------------------------------------------------------------
-- record_reviews + record_review_flags — Reviewer Agent Check (ADR-0016).
-- The quality-gate's durable record: a review of one saved decision_records row
-- and the grounded flags it produced, with the user's disposition of each flag.
-- A record counts as "reviewed" when it has a record_reviews row with status
-- 'complete' (reviewed-status is derived here, so decision_records is unchanged).
-- Flags are written only when a review reaches 'complete' (HITL: on the user's
-- accept) — see src/lib/reviewer/orchestrator.ts. Additive only: no existing
-- table or policy is changed.
-- ---------------------------------------------------------------------------

create table public.record_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The record this review is about; drop the review if the record goes.
  decision_record_id uuid not null references public.decision_records (id) on delete cascade,
  -- Lifecycle: a review is active, paused (by the user or the breaker), complete (accepted), or
  -- discarded (rejected). Only 'complete' marks the record reviewed.
  status text not null default 'active' check (status in ('active', 'paused', 'complete', 'discarded')),
  -- Loop bound (ADR-0016): clamped to the FSM hard cap (8) in app code before insert.
  check_budget integer not null default 4 check (check_budget between 1 and 8),
  checks_done integer not null default 0 check (checks_done >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index record_reviews_user_id_idx on public.record_reviews (user_id);
create index record_reviews_decision_record_id_idx on public.record_reviews (decision_record_id);

create table public.record_review_flags (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.record_reviews (id) on delete cascade,
  -- Denormalised owner so own-rows RLS applies directly to flags (no join to the review).
  user_id uuid not null references auth.users (id) on delete cascade,
  dimension text not null check (dimension in ('support', 'accuracy', 'specificity', 'completeness')),
  severity text not null check (severity in ('info', 'caution', 'serious')),
  target_field text not null check (target_field in ('title', 'situation', 'cue', 'decision', 'why', 'outcome', 'record')),
  message text not null,
  -- Validated citations [{source, id, title}] pointing at really-retrieved evidence; [] for
  -- intrinsic / absence flags (the app guarantees a flag never cites un-retrieved evidence).
  citations jsonb not null default '[]'::jsonb,
  disposition text not null default 'pending' check (disposition in ('pending', 'accepted', 'dismissed')),
  model_used text,
  prompt_version text,
  created_at timestamptz not null default now()
);
create index record_review_flags_review_id_idx on public.record_review_flags (review_id);
create index record_review_flags_user_id_idx on public.record_review_flags (user_id);

alter table public.record_reviews enable row level security;
alter table public.record_review_flags enable row level security;

-- Own-rows policies (mirror interview_sessions / interview_turns): a user sees and changes only
-- their own.
create policy "Users read own record_reviews" on public.record_reviews for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own record_reviews" on public.record_reviews for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own record_reviews" on public.record_reviews for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own record_reviews" on public.record_reviews for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own record_review_flags" on public.record_review_flags for select to authenticated
  using ((select auth.uid()) = user_id);
-- A flag must be owned by the user AND belong to a review the user owns, so a flag can never be
-- attached to another user's review even though own-rows alone would allow the user_id.
create policy "Users insert own record_review_flags" on public.record_review_flags for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.record_reviews r
      where r.id = review_id and r.user_id = (select auth.uid())
    )
  );
create policy "Users update own record_review_flags" on public.record_review_flags for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.record_reviews r
      where r.id = review_id and r.user_id = (select auth.uid())
    )
  );
create policy "Users delete own record_review_flags" on public.record_review_flags for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger record_reviews_set_updated_at before update on public.record_reviews
  for each row execute function public.set_updated_at();
