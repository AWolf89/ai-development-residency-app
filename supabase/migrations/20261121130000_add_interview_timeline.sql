-- ---------------------------------------------------------------------------
-- interview_sessions.timeline + project_id — Decision-Point Interview (ADR-0021).
-- A timeline-anchored interview drafts a project timeline from the user's files,
-- the user corrects it, and the confirmed timeline is stored here so the question
-- loop can anchor to its decision points and survive pause/resume.
--   * project_id  — the project whose files seeded the timeline (null = the older
--                   Reasoning Interview flow, which is unchanged).
--   * timeline    — the user-CONFIRMED timeline (jsonb array of entries), or null
--                   until confirmed. Null + a project_id + no turns means the user
--                   is still in the timeline phase (the orchestrator re-drafts it).
-- Additive only: no existing column, policy, or row is changed. The table's own
-- own-rows RLS already covers the new columns.
-- ---------------------------------------------------------------------------

alter table public.interview_sessions
  add column project_id uuid references public.projects (id) on delete set null,
  add column timeline jsonb;

create index interview_sessions_project_id_idx
  on public.interview_sessions (project_id);
