-- ---------------------------------------------------------------------------
-- Structured provenance fields (ADR-0022 §5.2 of the evidence-foundation plan).
-- Makes attribution and supporting-passage provenance first-class, and adds the
-- structured missing-info store the proposal's §4.3 field list wants (which also
-- becomes the Investigation Queue's backing store later).
--
-- Three additive changes; nothing existing is rewritten and every new row carries
-- its own-rows RLS (ADR-0003/0007), the same discipline as ADR-0015/0019/0022:
--
--   1. decision_records.contribution / attribution_note — WHO did the work
--      (individual vs team vs project). Nullable: a record with no contribution
--      set reads as UNSPECIFIED and is never defaulted to 'individual' (AC4), so
--      the proposal's #1 rule (don't present team work as individual) can finally
--      be enforced on a column that exists.
--   2. evidence_links.location — WHERE in a source a citation is backed (page,
--      section, or char range), so a citation points at a span, not just a file.
--   3. missing_info_items — WHAT is still unknown, as structured items against a
--      decision record, a claim, and/or a role requirement.
-- ---------------------------------------------------------------------------

-- ── 1. attribution on the evidence record ────────────────────────────────────
alter table public.decision_records
  add column if not exists contribution text,
  add column if not exists attribution_note text;

alter table public.decision_records
  drop constraint if exists decision_records_contribution_check;
alter table public.decision_records
  add constraint decision_records_contribution_check
  check (
    contribution is null
    or contribution in ('individual', 'team', 'project')
  );

comment on column public.decision_records.contribution is
  'Attribution: whether the work was individual, team, or project-level. NULL = unspecified (never defaulted to individual — the record must not read as a solo accomplishment unless the user says so).';
comment on column public.decision_records.attribution_note is
  'Optional free-text qualifier for the contribution (e.g. "I owned the schema; the team built the UI").';

-- ── 2. supporting span on the evidence link ──────────────────────────────────
alter table public.evidence_links
  add column if not exists location text;

comment on column public.evidence_links.location is
  'Where in the source this link is backed — a page, section, or char range. NULL = the whole document (today''s behaviour). Lets a citation point at a span, not just a file.';

-- ── 3. structured missing-info store ─────────────────────────────────────────
-- Each item records one thing that is still unknown, hung off whichever of a
-- decision record / claim / role requirement it concerns (at least one set). It
-- doubles as the Investigation Queue's backing store (Phase 3) and feeds the
-- claim lifecycle's "open gap" signal (ADR-0022 §3).
create table public.missing_info_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Polymorphic subject: at least one of these is set (the CHECK below).
  decision_record_id uuid references public.decision_records (id) on delete cascade,
  claim_id uuid references public.claims (id) on delete cascade,
  role_requirement_id uuid references public.role_requirements (id) on delete cascade,
  -- What is unknown and (optionally) why it matters.
  description text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint missing_info_items_subject_present check (
    num_nonnulls(decision_record_id, claim_id, role_requirement_id) >= 1
  )
);
create index missing_info_items_user_id_idx on public.missing_info_items (user_id);
create index missing_info_items_decision_record_id_idx on public.missing_info_items (decision_record_id);
create index missing_info_items_claim_id_idx on public.missing_info_items (claim_id);
create index missing_info_items_role_requirement_id_idx on public.missing_info_items (role_requirement_id);
create index missing_info_items_status_idx on public.missing_info_items (status);

alter table public.missing_info_items enable row level security;

-- Own-rows policies (mirror record_reviews / claims): a user sees and changes only
-- their own missing-info items. On write, each referenced subject that is set must
-- also belong to the user, so an item can never be hung off another user's row.
create policy "Users read own missing_info_items" on public.missing_info_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own missing_info_items" on public.missing_info_items for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      decision_record_id is null
      or exists (
        select 1 from public.decision_records dr
        where dr.id = decision_record_id and dr.user_id = (select auth.uid())
      )
    )
    and (
      claim_id is null
      or exists (
        select 1 from public.claims c
        where c.id = claim_id and c.user_id = (select auth.uid())
      )
    )
    and (
      role_requirement_id is null
      or exists (
        select 1 from public.role_requirements rr
        where rr.id = role_requirement_id and rr.user_id = (select auth.uid())
      )
    )
  );
create policy "Users update own missing_info_items" on public.missing_info_items for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete own missing_info_items" on public.missing_info_items for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger missing_info_items_set_updated_at before update on public.missing_info_items
  for each row execute function public.set_updated_at();

comment on table public.missing_info_items is
  'Structured "what is still unknown" items, hung off a decision record / claim / role requirement (ADR-0022 §5.2). Doubles as the Investigation Queue backing store and feeds the claim lifecycle open-gap signal.';
