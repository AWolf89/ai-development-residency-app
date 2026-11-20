-- ---------------------------------------------------------------------------
-- Projects & File Detail Hub — ADR-0019.
--
-- A `project` is a per-user container for a real piece of work and the role the
-- user played in it. Files, decision records, and learning moments each link to
-- a project via a nullable `project_id` (assignment is optional; deleting a
-- project DETACHES its evidence via `on delete set null`, never deletes it).
--
-- Fork B (file detail hub): the only narrative added to `files` is a one-line
-- `caption`. Role / context / decisions stay in decision_records — the file page
-- is a hub that links records, it does not duplicate their narrative.
--
-- Security: `project_id` is client-supplied, so — exactly like the evidence_links
-- file-ownership harden (20261112000019) and the learning_moments target-role
-- check (20261119050000) — each table's INSERT/UPDATE policy is re-created to
-- require that any project_id names a project owned by the caller (defence in
-- depth on top of own-rows RLS).
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- The user's role on the work (e.g. "Tech lead"). Optional narrative lives in
  -- linked decision records, not here.
  role text,
  organisation text,
  summary text,
  started_on date,
  ended_on date,
  -- Lifecycle. text + CHECK (like decision_records.status / learning_moments.kind)
  -- rather than a Postgres enum: one line, widenable later with a migration.
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_status_check check (status in ('active', 'archived')),
  -- If both dates are set, the end may not precede the start (also enforced in
  -- app validation, src/lib/projects/validation.ts).
  constraint projects_date_order_check
    check (started_on is null or ended_on is null or ended_on >= started_on)
);

create index projects_user_id_idx on public.projects (user_id);

alter table public.projects enable row level security;

create policy "Users read own projects"
  on public.projects for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own projects"
  on public.projects for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own projects"
  on public.projects for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete own projects"
  on public.projects for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Nullable project_id on the three evidence tables (+ files.caption), each with
-- an index. `on delete set null` so deleting a project detaches, never deletes.
-- ---------------------------------------------------------------------------

alter table public.files
  add column if not exists project_id uuid
    references public.projects (id) on delete set null,
  add column if not exists caption text;
create index if not exists files_project_id_idx on public.files (project_id);

alter table public.decision_records
  add column if not exists project_id uuid
    references public.projects (id) on delete set null;
create index if not exists decision_records_project_id_idx
  on public.decision_records (project_id);

alter table public.learning_moments
  add column if not exists project_id uuid
    references public.projects (id) on delete set null;
create index if not exists learning_moments_project_id_idx
  on public.learning_moments (project_id);

-- ---------------------------------------------------------------------------
-- Cross-table ownership guard: you may assign a row to no project or a project
-- you own, and nothing else. Re-create each table's INSERT/UPDATE policy,
-- preserving its existing checks and adding the project-ownership clause.
-- ---------------------------------------------------------------------------

-- Reusable predicate text (inlined per policy): project_id is null OR owned by caller.

-- files: previously only checked the row's own user_id.
drop policy if exists "Users insert own files" on public.files;
create policy "Users insert own files" on public.files
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
        where p.id = project_id and p.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users update own files" on public.files;
create policy "Users update own files" on public.files
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
        where p.id = project_id and p.user_id = (select auth.uid())
      )
    )
  );

-- decision_records: previously only checked the row's own user_id.
drop policy if exists "Users insert own decision_records" on public.decision_records;
create policy "Users insert own decision_records" on public.decision_records
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
        where p.id = project_id and p.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users update own decision_records" on public.decision_records;
create policy "Users update own decision_records" on public.decision_records
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
        where p.id = project_id and p.user_id = (select auth.uid())
      )
    )
  );

-- learning_moments: PRESERVE the existing target_role ownership check
-- (20261119050000) and ADD the project ownership check.
drop policy if exists "Users insert own learning_moments" on public.learning_moments;
create policy "Users insert own learning_moments" on public.learning_moments
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      target_role_id is null
      or exists (
        select 1 from public.target_roles tr
        where tr.id = target_role_id and tr.user_id = (select auth.uid())
      )
    )
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
        where p.id = project_id and p.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users update own learning_moments" on public.learning_moments;
create policy "Users update own learning_moments" on public.learning_moments
  for update to authenticated
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
    and (
      project_id is null
      or exists (
        select 1 from public.projects p
        where p.id = project_id and p.user_id = (select auth.uid())
      )
    )
  );

comment on table public.projects is
  'A per-user container for a real piece of work and the user''s role in it (ADR-0019).';
comment on column public.projects.role is 'The user''s role on the project (e.g. "Tech lead").';
comment on column public.projects.status is 'active | archived — project lifecycle.';
comment on column public.files.caption is
  'One-line "what this deliverable is" (Fork B); the file detail hub''s only narrative.';
comment on column public.files.project_id is 'Optional owning project (ADR-0019); detaches on project delete.';
comment on column public.decision_records.project_id is 'Optional owning project (ADR-0019); detaches on project delete.';
comment on column public.learning_moments.project_id is 'Optional owning project (ADR-0019); detaches on project delete.';
