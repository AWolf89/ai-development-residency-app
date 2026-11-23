# Architecture Decision Records

This folder records the important technical decisions for this project: what we chose, what else we considered, and the costs we accepted. Code shows *what* the system does; these files explain *why*.

- One decision per file, named `NNNN-short-title.md`, numbered in order. Numbers are never reused.
- Format: MADR 4.0.0 (https://github.com/adr/madr), or Nygard's short format for small decisions.
- Accepted records are not edited. A changed decision gets a new record that supersedes the old one.
- Create one: `python3 tools/adr/new_adr.py "Use Supabase for the database"`
- Check them: `python3 tools/adr/check_adr.py` and `python3 tools/adr/check_adr_rules.py`

| ADR | Title | Status |
|---|---|---|
| [0001](0001-use-next-js-with-the-app-router-and-typescript.md) | Use Next.js with the App Router and TypeScript | proposed |
| [0002](0002-use-material-ui-for-the-interface.md) | Use Material UI for the interface | proposed |
| [0003](0003-use-supabase-for-the-database-with-row-level-security.md) | Use Supabase for the database with row-level security | proposed |
| [0004](0004-host-the-app-on-vercel.md) | Host the app on Vercel | proposed |
| [0005](0005-defer-ai-agent-features-to-later-weeks-for-the-week-3-releas.md) | Defer AI agent features to later weeks for the Week 3 release | proposed |
| [0006](0006-disable-cache-components-for-standard-supabase-authenticatio.md) | Disable Cache Components for standard Supabase authentication | proposed |
| [0007](0007-handle-user-career-data-with-a-privacy-by-default-policy.md) | Handle user career data with a privacy-by-default policy | proposed |
| [0008](0008-store-reference-data-in-one-generic-read-only-table.md) | Store reference data in one generic read-only table | proposed |
| [0009](0009-use-openrouter-and-the-vercel-ai-sdk-as-the-model-gateway.md) | Use OpenRouter and the Vercel AI SDK as the model gateway | proposed |
| [0010](0010-use-pgvector-for-closed-rag-retrieval-over-reference-and-evidence.md) | Use pgvector for closed-RAG retrieval over the reference corpus and user evidence | proposed |
| [0011](0011-classify-evidence-against-role-requirements-with-a-grounded-four-verdict-schema.md) | Classify evidence against role requirements with a grounded four-verdict schema | proposed |
| [0012](0012-present-gap-verdicts-in-three-buckets-computed-on-demand.md) | Present gap verdicts in three buckets, computed on demand | proposed |
| [0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md) | Model the Reasoning Interview as an explicit TypeScript FSM with a human-in-the-loop save gate | proposed |
| [0014](0014-persist-interview-sessions-and-turns-for-decision-records.md) | Persist interview sessions and turns that feed decision records | proposed |
| [0015](0015-model-a-claim-as-a-projection-over-decision-records.md) | Model a claim as a projection over decision records, not a new table | proposed |
| [0016](0016-model-the-reviewer-agent-check-as-a-grounded-fsm-quality-gate.md) | Model the Reviewer Agent Check as a grounded TypeScript FSM quality gate with a human-in-the-loop accept | proposed |
| [0017](0017-model-the-evidence-investigation-agent-as-a-bounded-react-retrieval-fsm.md) | Model the Evidence Investigation Agent as a bounded ReAct retrieval FSM with a human-in-the-loop save gate | proposed |
| [0018](0018-model-learning-moment-capture-as-a-standalone-record-with-kinds.md) | Model Learning Moment Capture as a standalone record with kinds, not an interview extension | proposed |
| [0019](0019-add-projects-as-a-cross-cutting-organising-entity-and-file-detail-hub.md) | Add Projects as a cross-cutting organising entity and a file-detail hub | proposed |
| [0020](0020-analyze-uploaded-files-into-grounded-framework-tags-with-a-clarification-fsm.md) | Analyze uploaded files into grounded framework tags with a human-in-the-loop clarification FSM | proposed |
| [0021](0021-anchor-the-cdm-interview-to-a-user-corrected-project-timeline.md) | Anchor the CDM interview to a user-corrected project timeline, with a budget-neutral conclusion→redirect branch | proposed |
| [0022](0022-split-the-evidence-record-from-the-claim-and-define-the-clai.md) | Split the evidence record from the claim and define the claim lifecycle | accepted |
| [0023](0023-reconcile-new-uploads-against-existing-evidence-and-store-co.md) | Reconcile new uploads against existing evidence and store conflicts in a dedicated table | accepted |
