-- ---------------------------------------------------------------------------
-- Interview → learning-moment proposal link (ADR-0025).
-- The interview can now notice a learning moment in an answer and propose it
-- through a second HITL gate. These additive columns give a proposed/accepted
-- moment its provenance and make the proposal gate idempotent + rehydratable:
--
--   learning_moments.interview_session_id
--       — the interview a proposed moment came from (null = manual entry, the
--         unchanged ADR-0018 path). Forward link for display/traceability (AC2).
--   interview_turns.learning_moment_draft (jsonb)
--       — the detected proposal for the turn, stored like `paraphrase` so the
--         awaiting_learning_moment gate survives a reload. Null = no signal.
--   interview_turns.learning_moment_id
--       — stamped once the proposed moment is saved, so the save is idempotent
--         and rehydration knows the gate is resolved (mirrors decision_record_id).
--
-- Additive only: no existing column, policy, or row changes. The tables' own
-- own-rows RLS already covers the new columns (AC5). On delete of a session or
-- moment the links null out rather than cascading, preserving the other record.
-- ---------------------------------------------------------------------------

alter table public.learning_moments
  add column interview_session_id uuid
    references public.interview_sessions (id) on delete set null;

create index learning_moments_interview_session_id_idx
  on public.learning_moments (interview_session_id);

alter table public.interview_turns
  add column learning_moment_draft jsonb,
  add column learning_moment_id uuid
    references public.learning_moments (id) on delete set null;

create index interview_turns_learning_moment_id_idx
  on public.interview_turns (learning_moment_id);

comment on column public.learning_moments.interview_session_id is
  'The interview a proposed learning moment came from (ADR-0025); null for manual entry.';
comment on column public.interview_turns.learning_moment_draft is
  'The detected learning-moment proposal for this turn (ADR-0025); null when no signal.';
comment on column public.interview_turns.learning_moment_id is
  'The saved learning moment proposed from this turn (ADR-0025); idempotency + rehydration.';
