-- ---------------------------------------------------------------------------
-- Learning Moment Capture (Epic 3: Learning Agility Evidence) — ADR-0018.
--
-- A learning moment is a standalone piece of learning-agility evidence (NOT a
-- decision_record and NOT an interview turn): a short, user-entered record of a
-- moment where the user's thinking or capability changed. Four kinds, each with
-- its own capture prompt:
--   speed    — got up to speed quickly (the card's AC1 case)
--   insight  — something clicked
--   pivot    — changed course on new information
--   transfer — brought a skill from a past role into the new field
--
-- AC2: the record captures what was learned (`shift`), how long it took
-- (`duration`, required only for `speed` — enforced in app Zod validation), and
-- the result (`result`), plus the `context` it happened in.
-- AC5: own-rows RLS scopes every row to the signed-in user.
-- AC3: artifacts are linked by REUSING the existing evidence_links table (made
-- polymorphic below), not a parallel link table.
-- ---------------------------------------------------------------------------

create table public.learning_moments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The learning-agility kind. A text column + CHECK (like decision_records.source
  -- / .category) rather than a Postgres enum type: one line, widenable later with
  -- another migration (the remaining kinds — failure/feedback/unlearning — are
  -- deferred per ADR-0018).
  kind text not null,
  -- Narrative fields. NOT NULL (there is no draft lifecycle — a row is only ever
  -- inserted on a confirmed save, AC4): the app's Zod gate rejects empty/whitespace
  -- input before any insert, so no empty record is ever created.
  context text not null,
  shift text not null,
  result text not null,
  -- AC2 "how long it took". Nullable at the DB level: only `speed` requires it, and
  -- that conditional requirement is enforced in app validation (src/lib/
  -- learning-moments/validation.ts), mirroring how decision_records models
  -- required-ness in the app layer rather than with NOT NULL.
  duration text,
  -- Optional link to the role this evidence is aimed at.
  target_role_id uuid references public.target_roles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_moments_kind_check
    check (kind in ('speed', 'insight', 'pivot', 'transfer'))
);

create index learning_moments_user_id_idx on public.learning_moments (user_id);
create index learning_moments_target_role_id_idx
  on public.learning_moments (target_role_id);

alter table public.learning_moments enable row level security;

create policy "Users read own learning_moments"
  on public.learning_moments for select to authenticated
  using ((select auth.uid()) = user_id);

-- Insert/update: the row is the caller's own, and (defence in depth, mirroring the
-- evidence_links file-ownership harden, 20261112000019) any linked target_role is
-- also the caller's own.
create policy "Users insert own learning_moments"
  on public.learning_moments for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      target_role_id is null
      or exists (
        select 1 from public.target_roles tr
        where tr.id = target_role_id and tr.user_id = (select auth.uid())
      )
    )
  );

create policy "Users update own learning_moments"
  on public.learning_moments for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      target_role_id is null
      or exists (
        select 1 from public.target_roles tr
        where tr.id = target_role_id and tr.user_id = (select auth.uid())
      )
    )
  );

create policy "Users delete own learning_moments"
  on public.learning_moments for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger learning_moments_set_updated_at
  before update on public.learning_moments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Make evidence_links polymorphic so a learning moment can attach the same files
-- as a decision record (AC3), reusing the existing, security-hardened link table
-- rather than inventing a parallel one (ADR-0018).
--
-- - `decision_record_id` becomes nullable; a link now belongs to EXACTLY ONE of a
--   decision record or a learning moment (CHECK below). Existing rows all have a
--   decision_record_id set, so they satisfy the new CHECK unchanged.
-- - The INSERT/UPDATE policies gain a learning-moment ownership check, the same
--   defence-in-depth the file-ownership harden added for file_id.
-- ---------------------------------------------------------------------------

alter table public.evidence_links
  add column if not exists learning_moment_id uuid
    references public.learning_moments (id) on delete cascade;

alter table public.evidence_links
  alter column decision_record_id drop not null;

alter table public.evidence_links
  drop constraint if exists evidence_links_one_parent_check;
alter table public.evidence_links
  add constraint evidence_links_one_parent_check
  check (num_nonnulls(decision_record_id, learning_moment_id) = 1);

create index if not exists evidence_links_learning_moment_id_idx
  on public.evidence_links (learning_moment_id);

-- Re-create the INSERT policy: own row, own file (if any), own learning moment (if any).
drop policy if exists "Users insert own evidence_links" on public.evidence_links;
create policy "Users insert own evidence_links" on public.evidence_links
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      file_id is null
      or exists (
        select 1 from public.files f
        where f.id = file_id and f.user_id = (select auth.uid())
      )
    )
    and (
      learning_moment_id is null
      or exists (
        select 1 from public.learning_moments lm
        where lm.id = learning_moment_id and lm.user_id = (select auth.uid())
      )
    )
  );

-- Re-create the UPDATE policy with the same guarantees.
drop policy if exists "Users update own evidence_links" on public.evidence_links;
create policy "Users update own evidence_links" on public.evidence_links
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      file_id is null
      or exists (
        select 1 from public.files f
        where f.id = file_id and f.user_id = (select auth.uid())
      )
    )
    and (
      learning_moment_id is null
      or exists (
        select 1 from public.learning_moments lm
        where lm.id = learning_moment_id and lm.user_id = (select auth.uid())
      )
    )
  );

comment on table public.learning_moments is
  'Learning-agility evidence: a user-entered moment where thinking or capability changed (ADR-0018).';
comment on column public.learning_moments.kind is
  'speed | insight | pivot | transfer — the learning-agility kind; drives the capture prompt.';
comment on column public.learning_moments.context is 'What the user was facing.';
comment on column public.learning_moments.shift is
  'What changed / what was learned (AC2 "what"); the form label adapts per kind.';
comment on column public.learning_moments.result is 'The result / impact (AC2 "result").';
comment on column public.learning_moments.duration is
  'AC2 "how long it took"; required for kind=speed (enforced in app validation).';
comment on column public.evidence_links.learning_moment_id is
  'Polymorphic parent: set instead of decision_record_id to attach a file to a learning moment (ADR-0018).';
