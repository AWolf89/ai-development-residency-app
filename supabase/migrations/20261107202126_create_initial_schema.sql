-- Career Evidence Agent — initial schema (E3, Foundation).
-- Every per-user table has row-level security so each signed-in user
-- can only ever see and change their own rows.

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at current on every UPDATE.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per user account (keyed to the auth user).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users read own profiles"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users insert own profiles"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "Users update own profiles"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- files — metadata for a user's uploaded documents (bytes live in storage).
-- ---------------------------------------------------------------------------
create table public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index files_user_id_idx on public.files (user_id);
alter table public.files enable row level security;

create policy "Users read own files" on public.files for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own files" on public.files for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own files" on public.files for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own files" on public.files for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger files_set_updated_at before update on public.files
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- file_text — text extracted from a file.
-- ---------------------------------------------------------------------------
create table public.file_text (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_id uuid not null references public.files (id) on delete cascade,
  content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index file_text_user_id_idx on public.file_text (user_id);
create index file_text_file_id_idx on public.file_text (file_id);
alter table public.file_text enable row level security;

create policy "Users read own file_text" on public.file_text for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own file_text" on public.file_text for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own file_text" on public.file_text for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own file_text" on public.file_text for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger file_text_set_updated_at before update on public.file_text
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- target_roles — a job the user is aiming for.
-- ---------------------------------------------------------------------------
create table public.target_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  company text,
  job_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index target_roles_user_id_idx on public.target_roles (user_id);
alter table public.target_roles enable row level security;

create policy "Users read own target_roles" on public.target_roles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own target_roles" on public.target_roles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own target_roles" on public.target_roles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own target_roles" on public.target_roles for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger target_roles_set_updated_at before update on public.target_roles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- role_requirements — one requirement parsed from a target role.
-- ---------------------------------------------------------------------------
create table public.role_requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_role_id uuid not null references public.target_roles (id) on delete cascade,
  requirement_text text not null,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index role_requirements_user_id_idx on public.role_requirements (user_id);
create index role_requirements_target_role_id_idx on public.role_requirements (target_role_id);
alter table public.role_requirements enable row level security;

create policy "Users read own role_requirements" on public.role_requirements for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own role_requirements" on public.role_requirements for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own role_requirements" on public.role_requirements for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own role_requirements" on public.role_requirements for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger role_requirements_set_updated_at before update on public.role_requirements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- decision_records — a piece of career evidence (the core record).
-- ---------------------------------------------------------------------------
create table public.decision_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  summary text,
  reasoning text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index decision_records_user_id_idx on public.decision_records (user_id);
alter table public.decision_records enable row level security;

create policy "Users read own decision_records" on public.decision_records for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own decision_records" on public.decision_records for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own decision_records" on public.decision_records for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own decision_records" on public.decision_records for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger decision_records_set_updated_at before update on public.decision_records
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- record_versions — history snapshots of a decision record.
-- ---------------------------------------------------------------------------
create table public.record_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  decision_record_id uuid not null references public.decision_records (id) on delete cascade,
  version_number integer not null,
  content jsonb,
  created_at timestamptz not null default now()
);
create index record_versions_user_id_idx on public.record_versions (user_id);
create index record_versions_decision_record_id_idx on public.record_versions (decision_record_id);
alter table public.record_versions enable row level security;

create policy "Users read own record_versions" on public.record_versions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own record_versions" on public.record_versions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own record_versions" on public.record_versions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own record_versions" on public.record_versions for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- evidence_links — connects a decision record to a supporting file.
-- ---------------------------------------------------------------------------
create table public.evidence_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  decision_record_id uuid not null references public.decision_records (id) on delete cascade,
  file_id uuid references public.files (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index evidence_links_user_id_idx on public.evidence_links (user_id);
create index evidence_links_decision_record_id_idx on public.evidence_links (decision_record_id);
alter table public.evidence_links enable row level security;

create policy "Users read own evidence_links" on public.evidence_links for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own evidence_links" on public.evidence_links for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own evidence_links" on public.evidence_links for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own evidence_links" on public.evidence_links for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- record_requirement_links — maps a record to a role requirement (gap check).
-- ---------------------------------------------------------------------------
create table public.record_requirement_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  decision_record_id uuid not null references public.decision_records (id) on delete cascade,
  role_requirement_id uuid not null references public.role_requirements (id) on delete cascade,
  match_strength text,
  created_at timestamptz not null default now()
);
create index record_requirement_links_user_id_idx on public.record_requirement_links (user_id);
create index record_requirement_links_record_idx on public.record_requirement_links (decision_record_id);
create index record_requirement_links_requirement_idx on public.record_requirement_links (role_requirement_id);
alter table public.record_requirement_links enable row level security;

create policy "Users read own record_requirement_links" on public.record_requirement_links for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own record_requirement_links" on public.record_requirement_links for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own record_requirement_links" on public.record_requirement_links for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own record_requirement_links" on public.record_requirement_links for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- extraction_runs — a log of each text-extraction / processing job.
-- ---------------------------------------------------------------------------
create table public.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_id uuid references public.files (id) on delete cascade,
  status text not null default 'pending',
  model text,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index extraction_runs_user_id_idx on public.extraction_runs (user_id);
create index extraction_runs_file_id_idx on public.extraction_runs (file_id);
alter table public.extraction_runs enable row level security;

create policy "Users read own extraction_runs" on public.extraction_runs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own extraction_runs" on public.extraction_runs for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own extraction_runs" on public.extraction_runs for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own extraction_runs" on public.extraction_runs for delete to authenticated
  using ((select auth.uid()) = user_id);
