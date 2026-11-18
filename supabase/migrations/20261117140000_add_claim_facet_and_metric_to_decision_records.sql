-- ---------------------------------------------------------------------------
-- Add the claim facet (category) and the self-reported-metric flag to
-- decision_records, for the Claims / Evidence Profile feature (ADR-0015).
--
-- A "claim" is a decision_record viewed through the claims module; these two
-- columns give the evidence profile's facet tabs and the "Self-reported metric"
-- chip real, user-set data (no inference, no new AI).
--
-- Additive only: both columns are nullable / defaulted, so existing rows and
-- in-progress drafts stay valid, and RLS is unchanged — decision_records already
-- enables own-rows select/insert/update/delete, which govern these columns too.
-- `category` is a text column + CHECK (like `source`), widenable later without a
-- Postgres enum type.
-- ---------------------------------------------------------------------------

alter table public.decision_records
  add column if not exists category text,
  add column if not exists is_metric boolean not null default false;

alter table public.decision_records
  drop constraint if exists decision_records_category_check;

alter table public.decision_records
  add constraint decision_records_category_check
  check (
    category is null
    or category in ('leadership', 'delivery', 'stakeholders', 'technical')
  );

comment on column public.decision_records.category is
  'Claim facet for the evidence profile tabs (leadership/delivery/stakeholders/technical), or NULL = unfiled.';
comment on column public.decision_records.is_metric is
  'User mark that this claim is a self-reported number (e.g. "reduced errors by 30%") with no file; drives the Self-reported metric chip.';
