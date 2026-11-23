-- ---------------------------------------------------------------------------
-- claims + claim_evidence — split the claim from the evidence record (ADR-0022).
--
-- Today a "claim" is a decision_records row viewed through src/lib/claims/
-- (ADR-0015). ADR-0022 (Option B) makes the claim its own aggregate so the
-- source -> evidence record -> claim fan-out becomes expressible, WITHOUT
-- touching decision_records or its RLS:
--
--   files -> evidence_links -> decision_records -> claim_evidence -> claims
--
-- Rollout is additive and behind current behaviour (ADR-0022 §2):
--   * both tables are new; decision_records / evidence_links are untouched;
--   * each confirmed decision_record is backfilled to exactly one claim with
--     one claim_evidence link (real rows only — no invented data, ADR-0005/0015);
--   * because the backfill is strictly 1:1, the /dashboard projection is
--     identical once src/lib/claims/ is re-pointed at claims.
-- Fan-out (a claim spanning several records, or a record feeding several claims)
-- is enabled only later, once the 1:1 world is proven live.
--
-- Lifecycle (ADR-0022 §3): `claims.status` is a six-state CHECK. Only the two
-- human decisions (user_confirmed, archived) are ever authoritatively stored
-- here; every evidence-derived state (draft / needs_investigation / supported /
-- challenged) is recomputed on read by the pure src/lib/claims/lifecycle.ts
-- reducer, so the lifecycle can never silently disagree with the evidence
-- (ADR-0012/0015). The stored column defaults to 'draft' and carries the human
-- decision; the effective status shown to the user is computed.
--
-- The claim facets category / is_metric are NOT moved in Phase 1 (ADR-0022 §1):
-- the claim reads them from its single backing record during the 1:1 world.
-- Relocating them is a later, separate migration.
-- ---------------------------------------------------------------------------

-- ── claims ────────────────────────────────────────────────────────────────
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Lifecycle state (ADR-0022 §3). Six states; only 'user_confirmed' and
  -- 'archived' are stored decisions, the rest are recomputed on read. 'draft'
  -- is the baseline a claim is created with.
  status text not null default 'draft' check (
    status in (
      'draft',
      'needs_investigation',
      'supported',
      'user_confirmed',
      'challenged',
      'archived'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index claims_user_id_idx on public.claims (user_id);

alter table public.claims enable row level security;

-- Own-rows policies (mirror decision_records / record_reviews): a user sees and
-- changes only their own claims (ADR-0003/0007).
create policy "Users read own claims" on public.claims for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own claims" on public.claims for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own claims" on public.claims for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own claims" on public.claims for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger claims_set_updated_at before update on public.claims
  for each row execute function public.set_updated_at();

-- ── claim_evidence ──────────────────────────────────────────────────────────
-- Many-to-many join between claims and decision_records: one evidence record ->
-- many claims, one claim -> many evidence records (ADR-0022 §1). Phase 1 keeps
-- it strictly 1:1 via the backfill and the save path; the UNIQUE guard makes a
-- duplicate link for the same (claim, record) impossible.
create table public.claim_evidence (
  id uuid primary key default gen_random_uuid(),
  -- Denormalised owner so own-rows RLS applies directly without a join.
  user_id uuid not null references auth.users (id) on delete cascade,
  claim_id uuid not null references public.claims (id) on delete cascade,
  decision_record_id uuid not null references public.decision_records (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (claim_id, decision_record_id)
);
create index claim_evidence_user_id_idx on public.claim_evidence (user_id);
create index claim_evidence_claim_id_idx on public.claim_evidence (claim_id);
create index claim_evidence_decision_record_id_idx on public.claim_evidence (decision_record_id);

alter table public.claim_evidence enable row level security;

-- A link must be owned by the user AND reference a claim and a record the user
-- owns, so a link can never join another user's rows even though own-rows alone
-- would allow the user_id (mirrors record_review_flags).
create policy "Users read own claim_evidence" on public.claim_evidence for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own claim_evidence" on public.claim_evidence for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.claims c
      where c.id = claim_id and c.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.decision_records dr
      where dr.id = decision_record_id and dr.user_id = (select auth.uid())
    )
  );
create policy "Users update own claim_evidence" on public.claim_evidence for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.claims c
      where c.id = claim_id and c.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.decision_records dr
      where dr.id = decision_record_id and dr.user_id = (select auth.uid())
    )
  );
create policy "Users delete own claim_evidence" on public.claim_evidence for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ── backfill: one claim + one link per confirmed decision_record ──────────────
-- Real rows only; the 1:1 mapping keeps the live /dashboard identical at cutover
-- (ADR-0022 §2). A temp mapping table pairs each new claim id with its source
-- record so the two inserts stay correlated. on commit drop: migrations run in a
-- transaction, so the temp table is cleaned up automatically.
create temporary table _claim_backfill (
  claim_id uuid not null default gen_random_uuid(),
  decision_record_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
) on commit drop;

insert into _claim_backfill (decision_record_id, user_id, created_at, updated_at)
  select dr.id, dr.user_id, dr.created_at, dr.updated_at
  from public.decision_records dr
  where dr.status = 'confirmed';

insert into public.claims (id, user_id, status, created_at, updated_at)
  select claim_id, user_id, 'draft', created_at, updated_at
  from _claim_backfill;

insert into public.claim_evidence (user_id, claim_id, decision_record_id)
  select user_id, claim_id, decision_record_id
  from _claim_backfill;

comment on table public.claims is
  'A claim: a statement about what the user did/achieved (ADR-0022). Its own aggregate, joined to evidence records through claim_evidence. status is the six-state lifecycle; only user_confirmed/archived are stored, the rest computed on read (src/lib/claims/lifecycle.ts).';
comment on table public.claim_evidence is
  'Many-to-many join between claims and decision_records (ADR-0022 §1): one record -> many claims, one claim -> many records. Phase 1 is strictly 1:1.';
comment on column public.claims.status is
  'Lifecycle (ADR-0022 §3): draft | needs_investigation | supported | user_confirmed | challenged | archived. Stored only for the human decisions (user_confirmed, archived); the evidence-derived states are recomputed on read so status never disagrees with the evidence.';
