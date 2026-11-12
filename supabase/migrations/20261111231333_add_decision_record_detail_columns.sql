-- ---------------------------------------------------------------------------
-- Add decision-record detail columns (Decision Records & Profile Save, E-build 6).
--
-- The existing decision_records table (20261107202126_create_initial_schema.sql)
-- already has title/summary/reasoning/status and full own-rows RLS + updated_at
-- trigger. This migration adds the structured interview fields the feature needs:
-- situation, cue, decision, why, outcome, and a labelled source.
--
-- All new columns are NULLABLE on purpose: existing rows and in-progress drafts
-- stay valid, and required-ness for a *confirmed* save is enforced in the app's
-- Zod validation layer (src/lib/decision-records/validation.ts), not by NOT NULL.
-- This keeps the migration non-breaking and reversible.
--
-- `source` is constrained by a CHECK to the two labels AC2 allows. A CHECK is
-- used instead of a dedicated Postgres enum type: it is one line, easy to widen
-- later with another migration, and matches how `status` is modelled as text.
--
-- RLS is unchanged: the table already enables RLS with own-rows
-- select/insert/update/delete policies, which satisfies AC7. Adding columns does
-- not alter those policies.
-- ---------------------------------------------------------------------------

alter table public.decision_records
  add column if not exists situation text,
  add column if not exists cue text,
  add column if not exists decision text,
  add column if not exists why text,
  add column if not exists outcome text,
  add column if not exists source text;

-- Only allow the two source labels from AC2 (or NULL while unset / drafting).
alter table public.decision_records
  drop constraint if exists decision_records_source_check;

alter table public.decision_records
  add constraint decision_records_source_check
  check (source is null or source in ('artifact', 'self_reported'));

comment on column public.decision_records.situation is 'The context the decision was made in.';
comment on column public.decision_records.cue is 'What the user noticed that prompted the decision (optional, recommended).';
comment on column public.decision_records.decision is 'The decision the user made.';
comment on column public.decision_records.why is 'The reasoning behind the decision (optional, recommended).';
comment on column public.decision_records.outcome is 'What resulted from the decision.';
comment on column public.decision_records.source is 'Provenance label: artifact (from an uploaded file) or self_reported.';
