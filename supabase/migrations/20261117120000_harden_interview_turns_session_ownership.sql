-- ---------------------------------------------------------------------------
-- Harden interview_turns write policies (RLS): a turn must belong to a session
-- the caller owns, not merely carry the caller's user_id. This brings the live
-- database in line with the intent of migration 20261116120000 — whose edit to
-- add this check could not take effect, because that migration was already
-- applied and is never re-run.
--
-- Idempotent: each policy is dropped if present and recreated, so this is safe
-- whether or not the hardened form is already in place. Additive to RLS only;
-- no table, column, or data is changed.
-- ---------------------------------------------------------------------------

drop policy if exists "Users insert own interview_turns" on public.interview_turns;
create policy "Users insert own interview_turns" on public.interview_turns for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users update own interview_turns" on public.interview_turns;
create policy "Users update own interview_turns" on public.interview_turns for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.interview_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );
