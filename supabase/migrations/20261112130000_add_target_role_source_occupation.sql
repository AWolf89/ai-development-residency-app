-- Title-first path provenance: record which O*NET occupation a target role's
-- requirements were derived from, so the profile can show e.g.
-- "Derived from: Software Developers (O*NET)".
--
-- Both columns are NULLABLE: job-description-pasted roles leave them null, and
-- existing rows stay valid. Stored as text (title + SOC code) rather than an FK —
-- the display value is what we need, and it survives any later reference refresh.
-- RLS on target_roles is unchanged (own-rows select/insert/update/delete).

alter table public.target_roles
  add column if not exists source_occupation_title text,
  add column if not exists source_occupation_code text;

comment on column public.target_roles.source_occupation_title is
  'O*NET occupation title this role''s requirements were derived from (title path), else null.';
comment on column public.target_roles.source_occupation_code is
  'O*NET-SOC code of the source occupation (title path), else null.';
