-- ADR-0020 · File Analysis & Tagging — batch "Analyze all".
--
-- Marks where a file sits in the batch flow. null = never analyzed; 'needs_review' = the batch
-- found it too ambiguous to tag confidently and left it for interactive review; 'reviewed' = the
-- batch auto-tagged it, or the user accepted an interactive analysis. The files table already has
-- own-rows RLS, so the new column inherits it; no policy change is needed.

alter table public.files
  add column analysis_status text
  check (analysis_status in ('needs_review', 'reviewed'));
