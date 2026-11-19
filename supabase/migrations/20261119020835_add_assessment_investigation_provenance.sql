-- ---------------------------------------------------------------------------
-- Evidence Investigation Agent provenance (EIA 5, ADR-0015).
-- Additive columns on requirement_gap_assessments so an investigated verdict is
-- distinguishable from the one-shot Gap Classification verdict. No new table, no
-- policy change: the table's own-rows RLS (migration 20261114140000) already covers
-- these columns, and `role_requirement_id` is already UNIQUE there, so the
-- investigation's save upserts on that key — no new constraint is needed.
-- ---------------------------------------------------------------------------

-- How the current verdict was produced. Existing rows are all one-shot Gap Checks,
-- so the default backfills them correctly.
alter table public.requirement_gap_assessments
  add column method text not null default 'one_shot'
    check (method in ('one_shot', 'investigated'));

-- The investigation agent's self-reported confidence; null for one-shot rows.
alter table public.requirement_gap_assessments
  add column confidence text
    check (confidence is null or confidence in ('low', 'medium', 'high'));

-- How many searches an investigation spent before proposing the saved verdict;
-- null for one-shot rows.
alter table public.requirement_gap_assessments
  add column search_count integer
    check (search_count is null or search_count >= 0);
