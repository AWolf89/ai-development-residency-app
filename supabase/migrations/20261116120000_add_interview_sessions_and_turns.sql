-- ---------------------------------------------------------------------------
-- interview_sessions + interview_turns — Reasoning Interview (ADR-0013/0014).
-- The capture loop's durable checkpoint: a session (one project/decision under
-- discussion) and its ordered turns (ask -> answer -> paraphrase -> maybe save).
-- A saved turn points at the existing decision_records row; it does not copy it.
-- Additive only: no existing table or policy is changed.
-- ---------------------------------------------------------------------------

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The project / decision the interview is about (also seeds the question prompt topic).
  title text not null,
  -- Optional link to the target role the interview supports; keep the session if the role goes.
  target_role_id uuid references public.target_roles (id) on delete set null,
  -- Resume marker: an interview is active, paused (by the user or the breaker), or complete.
  status text not null default 'active' check (status in ('active', 'paused', 'complete')),
  -- Loop bound (ADR-0013): clamped to the FSM hard cap (10) in app code before insert.
  question_budget integer not null default 6 check (question_budget between 1 and 10),
  asked_count integer not null default 0 check (asked_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interview_sessions_user_id_idx on public.interview_sessions (user_id);
create index interview_sessions_target_role_id_idx on public.interview_sessions (target_role_id);

create table public.interview_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  -- Denormalised owner so own-rows RLS applies directly to turns (no join to the session).
  user_id uuid not null references auth.users (id) on delete cascade,
  question_text text not null,
  -- The cited source {source, id, title} the question was grounded in, or null (open question).
  grounding_citation jsonb,
  answer_text text,
  -- The CDM draft {title, situation, cue, decision, why, outcome} the paraphrase produced, or null.
  paraphrase jsonb,
  status text not null default 'asked' check (status in ('asked', 'answered', 'skipped', 'saved')),
  -- Set when the turn is saved: the decision_records row it produced. Keep the turn if the record goes.
  decision_record_id uuid references public.decision_records (id) on delete set null,
  created_at timestamptz not null default now()
);
create index interview_turns_session_id_idx on public.interview_turns (session_id);
create index interview_turns_user_id_idx on public.interview_turns (user_id);

alter table public.interview_sessions enable row level security;
alter table public.interview_turns enable row level security;

-- Own-rows policies (mirror requirement_gap_assessments): a user sees and changes only their own.
create policy "Users read own interview_sessions" on public.interview_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own interview_sessions" on public.interview_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own interview_sessions" on public.interview_sessions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own interview_sessions" on public.interview_sessions for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own interview_turns" on public.interview_turns for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own interview_turns" on public.interview_turns for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own interview_turns" on public.interview_turns for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own interview_turns" on public.interview_turns for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger interview_sessions_set_updated_at before update on public.interview_sessions
  for each row execute function public.set_updated_at();
