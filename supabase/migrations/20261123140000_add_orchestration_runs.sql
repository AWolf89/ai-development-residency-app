-- Orchestration runs — the thin composition layer's durable workflow position (MVP 2 Phase 4,
-- ADR-0026).
--
-- One row per orchestrated flow, anchored to an uploaded file. It sequences the EXISTING per-agent
-- entry points (reconcile → propose → interview → review) with a review gate at each step, and
-- surfaces the derive-on-read Investigation Queue on completion. This table stores ONLY workflow
-- position — the discriminated-union state of the pure router (src/lib/orchestrator/machine.ts),
-- rehydrated exactly like an interview session (ADR-0014). It holds NO agent data (no proposals, no
-- flags, no records): every evidence side effect stays in its own agent's tables behind that agent's
-- accept-only HITL gate, so nothing here is duplicated and a failed step leaves prior saves intact
-- (AC4). This introduces NO distributed-systems machinery — no bus / saga / outbox / CDC
-- (CLAUDE.md §2.1, R2 rows stay DORMANT). Own-rows RLS throughout (AC5). Additive migration.
create table public.orchestration_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The uploaded file the flow is anchored to.
  file_id uuid not null references public.files (id) on delete cascade,
  -- Set once the propose step creates/links a project; seeds the interview step. Nullable.
  project_id uuid references public.projects (id) on delete set null,
  -- Links the interview sub-FSM session so its completion drives the interview step. Nullable.
  interview_session_id uuid references public.interview_sessions (id) on delete set null,
  -- The run's overall position (OrchestrationStatus). Mirrors the pure router's discriminated union.
  status text not null default 'running'
    check (status in ('running', 'awaiting_review', 'failed', 'complete')),
  -- The per-step ledger: { reconcile, propose, interview, review } → pending | awaiting_review |
  -- done | skipped | failed. Shape is validated by the pure router + its unit tests, not the DB.
  steps jsonb not null default '{}'::jsonb,
  -- The step in focus (StepKey), or null when complete.
  cursor text check (cursor in ('reconcile', 'propose', 'interview', 'review')),
  -- The step that failed, so resume knows where to re-enter; null unless status = 'failed'.
  failure_step text check (failure_step in ('reconcile', 'propose', 'interview', 'review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orchestration_runs_user_id_idx on public.orchestration_runs (user_id);
create index orchestration_runs_file_id_idx on public.orchestration_runs (file_id);

alter table public.orchestration_runs enable row level security;

-- Own-rows policies (mirror interview_sessions / reconciliation_flags): a user sees and changes only
-- their own runs, and on insert the anchoring file must also be theirs, so a run can never be hung
-- off another user's file even though own-rows alone would allow the user_id.
create policy "Users read own orchestration_runs" on public.orchestration_runs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own orchestration_runs" on public.orchestration_runs for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.files f
      where f.id = file_id and f.user_id = (select auth.uid())
    )
  );
create policy "Users update own orchestration_runs" on public.orchestration_runs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete own orchestration_runs" on public.orchestration_runs for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger orchestration_runs_set_updated_at before update on public.orchestration_runs
  for each row execute function public.set_updated_at();

comment on table public.orchestration_runs is
  'Thin orchestration layer workflow position (ADR-0026): one row per orchestrated flow anchored to a file, sequencing the existing per-agent entry points (reconcile/propose/interview/review) with a review gate at each step. Stores ONLY position (status + per-step ledger + cursor) — never agent data — so a failed step leaves prior saves intact and the user resumes. No bus/saga/outbox (R2 DORMANT). Own-rows RLS.';
