-- ---------------------------------------------------------------------------
-- Harden evidence_links: a linked file must belong to the same user.
--
-- Security review finding F1 (2026-11-11): the existing INSERT policy only
-- checked that the row's own user_id matched the caller. `file_id` is supplied by
-- the client, so a crafted request could store another user's file UUID as a
-- reference in the caller's own record. The files/file_text tables have their own
-- RLS, so contents were never exposed, but this tightens the boundary to defence
-- in depth: you may only link a file you own (or no file at all).
--
-- This replaces the INSERT policy and adds the same guarantee to UPDATE. No new
-- table, so RLS stays enabled; only the policies change.
-- ---------------------------------------------------------------------------

drop policy if exists "Users insert own evidence_links" on public.evidence_links;

create policy "Users insert own evidence_links" on public.evidence_links
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      file_id is null
      or exists (
        select 1
        from public.files f
        where f.id = file_id
          and f.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users update own evidence_links" on public.evidence_links;

create policy "Users update own evidence_links" on public.evidence_links
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      file_id is null
      or exists (
        select 1
        from public.files f
        where f.id = file_id
          and f.user_id = (select auth.uid())
      )
    )
  );
