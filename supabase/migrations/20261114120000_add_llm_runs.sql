-- E6 · AI foundation: one row per LLM call for cost/run visibility.
-- Metadata is always stored; prompt and reply text are written only in local development
-- (see src/lib/llm/log.ts shouldLogText()), because prompts contain people's career data.
-- Row-Level Security makes each row readable and insertable only by its owner; rows are
-- append-only (no update/delete policy). Mirrors ADR-0003 (RLS ownership) and ADR-0007
-- (privacy by default).
create table public.llm_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  prompt_id text not null,
  prompt_version text not null,
  model_requested text not null,
  model_used text,
  status text not null check (status in ('ok', 'error', 'invalid_output')),
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12, 6),
  latency_ms integer not null,
  error text,
  input_text text,
  output_text text
);

create index llm_runs_user_id_idx on public.llm_runs (user_id);
create index llm_runs_prompt_idx on public.llm_runs (prompt_id, prompt_version, created_at desc);

alter table public.llm_runs enable row level security;

create policy "Users read own llm_runs"
  on public.llm_runs for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert own llm_runs"
  on public.llm_runs for insert to authenticated
  with check ((select auth.uid()) = user_id);
-- No update or delete policy: run logs are append-only. Deleting an account deletes its runs (cascade).
