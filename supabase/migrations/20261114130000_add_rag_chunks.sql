-- Evidence Search Pipeline v1 (build order 8) — closed-RAG retrieval store. See ADR-0010
-- and docs/design/evidence-search-pipeline.md.
--
-- Additive only: `reference_items` and the existing matching in src/lib/target-roles/ are
-- untouched. This adds a vector store alongside them:
--   * reference_chunks  — shared, read-only passages chunked from reference_items
--                         (Tech Fleet SPF + O*NET). Read by any signed-in user; written only
--                         by the service-role backfill script (bypasses RLS).
--   * evidence_chunks   — per-user passages chunked from the user's own file_text /
--                         decision_records. Own-rows RLS, mirroring file_text.
-- Each table carries an embedding (pgvector) and a generated full-text column, and has a
-- hybrid-search function that merges keyword + vector results with reciprocal rank fusion
-- (Supabase's documented pattern: https://supabase.com/docs/guides/ai/hybrid-search).
--
-- EMBEDDING dimension (1536) must match src/lib/llm/embed.ts and tools/rag/index config.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- reference_chunks — shared, read-only reference passages.
-- ---------------------------------------------------------------------------
create table public.reference_chunks (
  id text primary key, -- "<source>:<ref_id>:<section>", e.g. "onet:15-2051.00:tasks"
  source text not null, -- 'techfleet-spf' | 'onet'
  ref_id text not null, -- citation id: SOC code (O*NET) or external_id/slug (framework)
  ref_kind text not null, -- 'occupation' | 'framework_skills' | ...
  title text not null,
  section text not null, -- 'overview'|'tasks'|'skills'|... or 'entity'
  content text not null,
  content_hash text not null, -- lets the backfill skip unchanged chunks (no re-embedding cost)
  source_version text,
  embedding extensions.vector(1536),
  fts tsvector generated always as (
    to_tsvector('english', title || ' ' || content)
  ) stored,
  updated_at timestamptz not null default now()
);

create index reference_chunks_source_ref_idx on public.reference_chunks (source, ref_id);
create index reference_chunks_fts_idx on public.reference_chunks using gin (fts);
create index reference_chunks_embedding_idx
  on public.reference_chunks using hnsw (embedding extensions.vector_cosine_ops);

create trigger reference_chunks_set_updated_at
  before update on public.reference_chunks
  for each row execute function public.set_updated_at();

alter table public.reference_chunks enable row level security;

-- Read-only reference data: any signed-in user may read; no write policy means the anon and
-- authenticated roles cannot write. The backfill script uses the service-role key (bypasses
-- RLS). Mirrors reference_items (20261111184355_create_reference_items.sql).
create policy "Authenticated users read reference_chunks"
  on public.reference_chunks for select to authenticated
  using (true);

grant select on public.reference_chunks to authenticated;

-- ---------------------------------------------------------------------------
-- evidence_chunks — per-user evidence passages (own-rows RLS, like file_text).
-- ---------------------------------------------------------------------------
create table public.evidence_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_kind text not null check (source_kind in ('file', 'decision_record')),
  file_id uuid references public.files (id) on delete cascade,
  decision_record_id uuid references public.decision_records (id) on delete cascade,
  title text not null default '',
  chunk_index integer not null default 0,
  content text not null,
  content_hash text not null,
  embedding extensions.vector(1536),
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index evidence_chunks_user_id_idx on public.evidence_chunks (user_id);
create index evidence_chunks_file_id_idx on public.evidence_chunks (file_id);
create index evidence_chunks_decision_record_id_idx
  on public.evidence_chunks (decision_record_id);
create index evidence_chunks_fts_idx on public.evidence_chunks using gin (fts);
create index evidence_chunks_embedding_idx
  on public.evidence_chunks using hnsw (embedding extensions.vector_cosine_ops);

create trigger evidence_chunks_set_updated_at
  before update on public.evidence_chunks
  for each row execute function public.set_updated_at();

alter table public.evidence_chunks enable row level security;

create policy "Users read own evidence_chunks"
  on public.evidence_chunks for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert own evidence_chunks"
  on public.evidence_chunks for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own evidence_chunks"
  on public.evidence_chunks for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete own evidence_chunks"
  on public.evidence_chunks for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Hybrid search: keyword (full-text) + meaning (vector), merged with reciprocal
-- rank fusion. security invoker, so each function runs under the caller's RLS —
-- evidence_hybrid_search therefore sees only the caller's own rows.
-- ---------------------------------------------------------------------------
create or replace function public.reference_hybrid_search(
  query_text text,
  query_embedding extensions.vector(1536),
  match_count int default 8,
  full_text_weight float default 1,
  semantic_weight float default 1,
  rrf_k int default 50
)
returns table (
  id text, source text, ref_id text, title text, section text, content text,
  keyword_rank bigint, semantic_rank bigint, similarity float, score float
)
language sql stable
security invoker
set search_path = public, extensions
as $$
with full_text as (
  select c.id,
         row_number() over (
           order by ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) desc
         ) as rank_ix
  from reference_chunks c
  where query_text <> ''
    and c.fts @@ websearch_to_tsquery('english', query_text)
  order by rank_ix
  limit least(match_count, 30) * 2
),
semantic as (
  select c.id,
         row_number() over (order by c.embedding <=> query_embedding) as rank_ix,
         1 - (c.embedding <=> query_embedding) as similarity
  from reference_chunks c
  where c.embedding is not null
  order by rank_ix
  limit least(match_count, 30) * 2
)
select c.id, c.source, c.ref_id, c.title, c.section, c.content,
       ft.rank_ix, s.rank_ix, s.similarity,
       coalesce(1.0 / (rrf_k + ft.rank_ix), 0.0) * full_text_weight
     + coalesce(1.0 / (rrf_k + s.rank_ix), 0.0) * semantic_weight as score
from full_text ft
full outer join semantic s on ft.id = s.id
join reference_chunks c on c.id = coalesce(ft.id, s.id)
order by score desc
limit least(match_count, 30)
$$;

create or replace function public.evidence_hybrid_search(
  query_text text,
  query_embedding extensions.vector(1536),
  match_count int default 8,
  full_text_weight float default 1,
  semantic_weight float default 1,
  rrf_k int default 50
)
returns table (
  id text, source text, ref_id text, title text, section text, content text,
  keyword_rank bigint, semantic_rank bigint, similarity float, score float
)
language sql stable
security invoker
set search_path = public, extensions
as $$
with full_text as (
  select c.id,
         row_number() over (
           order by ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) desc
         ) as rank_ix
  from evidence_chunks c
  where query_text <> ''
    and c.fts @@ websearch_to_tsquery('english', query_text)
  order by rank_ix
  limit least(match_count, 30) * 2
),
semantic as (
  select c.id,
         row_number() over (order by c.embedding <=> query_embedding) as rank_ix,
         1 - (c.embedding <=> query_embedding) as similarity
  from evidence_chunks c
  where c.embedding is not null
  order by rank_ix
  limit least(match_count, 30) * 2
)
select c.id::text,
       c.source_kind as source,
       case when c.title <> '' then c.title else c.id::text end as ref_id,
       c.title,
       '' as section,
       c.content,
       ft.rank_ix, s.rank_ix, s.similarity,
       coalesce(1.0 / (rrf_k + ft.rank_ix), 0.0) * full_text_weight
     + coalesce(1.0 / (rrf_k + s.rank_ix), 0.0) * semantic_weight as score
from full_text ft
full outer join semantic s on ft.id = s.id
join evidence_chunks c on c.id = coalesce(ft.id, s.id)::uuid
order by score desc
limit least(match_count, 30)
$$;

grant execute on function public.reference_hybrid_search to authenticated;
grant execute on function public.evidence_hybrid_search to authenticated;
