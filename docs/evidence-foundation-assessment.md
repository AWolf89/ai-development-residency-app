# Career Evidence Agent — Architecture Assessment & Phased Plan

**Prepared:** 2026-11-22
**Scope:** Evidence-based comparison of the current codebase against *career_evidence_agent_product_architecture_proposal.md*, plus a phased plan to move toward the proposed vision **without rebuilding working functionality.**
**Status:** Assessment only — no implementation. Decisions that change architecture become ADRs first (CLAUDE.md §5).

---

## 0. Headline finding (read this first)

**The proposal was written from an older MVP walkthrough and significantly understates what already exists.** It describes the app as a set of "separate tools" with "no LLM call, no agent, and no second service." That was true at the Week 3 release (ADR-0005). It is no longer true.

As of today the repo already contains:

- A **shared evidence data model** (`decision_records` as the core evidence record, a **polymorphic `evidence_links`** table, `projects` as a cross-cutting container, validated `citations`).
- A **closed-RAG retrieval layer** (`reference_chunks` / `evidence_chunks` + hybrid search with reciprocal rank fusion) that already does cross-document retrieval.
- **Four explicit FSM agents** — File Analysis, Reasoning/Decision-Point Interview, Evidence Investigation, Reviewer Check — each built to the same R1 pattern (pure `reduce(state,event)` + `server-only` orchestrator + HITL gate + budget cap + circuit breaker).
- A **hardened LLM gateway** (`src/lib/llm/`) that already enforces the R3 runtime caps (`max_tokens`, retries, timeout, Zod validation with bounded self-correction) the proposal calls for.

So this is **not** a from-scratch build toward the proposal. It is a **targeted evolution**: roughly **70–80% of the proposed architecture already exists**, four of the five proposed agents are already implemented as peer modules, and the genuine gaps are narrower — and different — from what the proposal frames as the big lifts.

The two things the proposal is *right* that we lack:
1. A **connected experience** — the navigation is still the siloed prototype (`src/components/Sidebar.tsx`), and nothing surfaces "what to do next."
2. A clean **source → evidence → claim separation** (proposal §4.4). We currently **fuse evidence record and claim into one row** (ADR-0015). This is the single most important conceptual decision to resolve.

The one thing to be *disciplined* about: the proposal's "Career Intelligence Orchestrator." A heavyweight stateful coordinator would violate the anti-cargo-cult clause (CLAUDE.md §2.1). We need a thin composition + surfacing layer, not LangGraph/sagas/a message bus. More in §6 and §9.

---

## 1. What already exists and can be reused (as-is)

| Proposal concept | Already implemented as | Evidence |
|---|---|---|
| Evidence record (the core entity, §4.2) | `decision_records` (CDM fields `situation/cue/decision/why/outcome`, `source`, version history) | `20261107202126_create_initial_schema.sql`, `20261111231333_*`, `src/lib/decision-records/` |
| Source provenance linking (§4.3) | **Polymorphic `evidence_links`** (file → decision_record XOR learning_moment, `num_nonnulls=1` CHECK), validated `citations` jsonb | `evidence_links`, `requirement_gap_assessments.citations` |
| Sources (§4.2) | `files` + `file_text` + Storage bucket | initial schema, `src/lib/files/` |
| Target Roles (§4.2) | `target_roles` + `role_requirements` (+ O*NET provenance) | `20261112130000_*`, `src/lib/target-roles/` |
| Evidence graph / cross-document retrieval (§4.5) | `reference_chunks` + `evidence_chunks` + `reference_hybrid_search()` / `evidence_hybrid_search()` (RRF, `security invoker`) | `20261114130000_add_rag_chunks.sql`, `src/lib/rag/` |
| **Evidence Intelligence Agent** (§5.3) | **File Analysis & Tagging FSM** — reads files (vision for images), grounds tags to `reference_items`, clarification loop, HITL | `src/lib/file-analysis/`, ADR-0020 |
| **Career Discovery & Interview Agent** (§5.4) | **Reasoning / Decision-Point Interview FSM** — adaptive grounded questions, answer classifier, timeline anchoring, budget cap, HITL confirm | `src/lib/interview/`, ADR-0013/0014/0021 |
| **Claim Validation & Quality Agent** (§5.6) | **Reviewer Agent Check FSM** — grounded flags across support/accuracy/specificity/completeness, severity, HITL | `src/lib/reviewer/`, ADR-0016 |
| **Career Mapping Agent** (§5.5) | **Gap Classification** (`met/partial/gap/unknown`) + **Evidence Investigation Agent** (ReAct multi-search) | `src/lib/gap/`, `src/lib/investigation/`, ADR-0011/0012/0017 |
| Model gateway / runtime caps (§1, R3) | `src/lib/llm/` — `config.ts` caps (`maxOutputTokens 1500`, `maxRetries 2`, `timeout 30s`, `maxCorrectionTurns 2`), `runStructured` Zod validation + self-correction, `llm_runs` cost log, `untrusted.ts` injection defense | `src/lib/llm/run.ts`, `config.ts`, `20261114120000_add_llm_runs.sql` |
| Claims surface (§6.6) | Claims-as-projection over `decision_records` (facet `category`, `is_metric`, derived status), on `/dashboard` | ADR-0015, `src/lib/claims/` |
| Projects workspace container (§6.2) | `projects` + nullable `project_id` on files/decision_records/learning_moments/interview_sessions | `20261120120000_*`, ADR-0019 |
| Learning moments (§6.4) | `learning_moments` (4 kinds) + file attach via polymorphic link | `20261119050000_*`, ADR-0018 |
| HITL gates, budget caps, circuit breakers (R1 §3.4/3.5) | Baked into every agent FSM (`saving` reachable only from `awaiting_*` on `accept`) | each `src/lib/*/machine.ts` |

**Reuse verdict:** the LLM gateway, RAG layer, all four agent FSMs, the decision-record/evidence/claim persistence core, projects, and RLS ownership model are **sound and should be preserved as-is.** They already satisfy the guardrails. Nothing here warrants a rewrite.

---

## 2. What partially exists but needs modification

| # | Proposal ask | What exists | What's missing / needs change |
|---|---|---|---|
| P1 | **Distinct source / evidence record / claim** (§4.4) | `files`→`evidence_links`→`decision_records`; claim = decision_record (ADR-0015, "one record = one claim") | **Evidence record and claim are fused.** No way for one evidence record to support multiple claims, or for a claim to draw on several evidence records. ADR-0015 explicitly deferred a `claims` child table. **This is the pivotal decision (see §5).** |
| P2 | **Attribution: individual vs team / who performed it** (§9.2, Tests 1 & 3) | Narrative only (`situation/decision/why/outcome`), `projects.role` | No **structured** actor/attribution field. The proposal's #1 regression test (don't over-claim team work as individual) can't be enforced on a column that doesn't exist. |
| P3 | **Supporting passage / page / location** (§4.3) | `evidence_links.note` (free text), `evidence_chunks` (chunked passages) | No passage offset / page / location granularity on the link itself. Citations point at a document, not a span. |
| P4 | **Claim lifecycle** (§Appendix B: draft→needs investigation→supported→user-confirmed→challenged→archived) | `decision_records.status` default `'draft'` with **no CHECK**; `record_reviews.status` is the real quality gate | Status is undocumented and app-only; no explicit claim lifecycle. "Challenged" exists only implicitly via review flags. |
| P5 | **Ingestion proposes a project & evidence records** (§6.1, §7 steps 2–4) | File Analysis reads + tags to reference vocabulary; auto-indexes to RAG | Analysis **tags**, it does not **propose a project or structured evidence records**, and does **no cross-document reconciliation at ingest.** The proposal's "don't make users create a project first" is not yet met. |
| P6 | **Cross-document reconciliation & conflict flagging at ingest** (§7 step 2, Test 7) | Cross-document retrieval at *query* time (hybrid search over all chunks) | No *ingest-time* pass that compares a new document against existing ones and **flags contradictions** before the user acts. |
| P7 | **Interview discovers learning moments** (§6.4) | `learning_moments` manual entry; interview writes decision records | Interview does not propose learning-moment records from the conversation. |
| P8 | **Gap Check → four categories + "evidence gap ≠ skill gap"** (§6.5) | `met/partial/gap/unknown` already (close match); investigation deepens a gap | Verdicts exist; the **UX framing** ("Demonstrated / Partial / Unverified / Development opportunity") and the explicit "investigate before recommending training" routing is not surfaced. |
| P9 | **My Profile → Career Evidence Library + health indicators** (§6.6) | `/dashboard` lists claims with summary; gap assessments exist | No consolidated **evidence health** view (claims-with-strong-evidence, needs-verification, projects-incomplete, outstanding-investigations). The data to compute it mostly exists. |
| P10 | **"Review claims" is a real destination** | Claims render on `/dashboard`; nav item "Review claims" is still **`Soon`** | Pure UX debt: the feature exists but the nav says it doesn't. `src/components/Sidebar.tsx:26`. |

---

## 3. What is genuinely missing

1. **Source ⇢ evidence ⇢ claim separation** (if we decide we want the fan-out — §5, decision P1).
2. **Career Intelligence Orchestrator** (§2.2/§5.2): there is **no cross-agent coordinator** and no agent-to-agent handoff. Agents are peer modules coupled only through shared DB tables, each triggered from its own route. *(Whether this should be built as described, or as a much thinner layer, is the key design question — §6/§9.)*
3. **Investigation Queue** (§8): the proactive "here's what to do next, and why it matters" list. **Nothing like it exists.** This is arguably the highest-leverage *new* feature, and most of its input signals already exist (see §5.5).
4. **Project Workspace** as a structured hub with Overview/Role/Evidence/Decisions/Outcomes/Skills/Learning/Claims/Investigations tabs (§6.2). Projects exist as a container; the rich workspace view does not.
5. **Connected, investigation-driven UX** (§3): the app still presents siloed tools; the user still coordinates the flow manually.
6. **Evidence health indicators** (§6.6) as a surfaced view.

---

## 4. Architectural conflicts & technical debt

- **C1 — `decision_records` is overloaded (the central tension).** One row is simultaneously a *decision record* (CDM narrative), an *evidence record*, and a *claim*. The proposal (§4.4) insists these are different kinds of thing with different cardinalities (a source supports many evidence records; an evidence record supports many claims). ADR-0015 made the fusion deliberately and even named the escape hatch ("a future `claims` child table could hang off a record"). **Resolving this is prerequisite to most of the proposal.** Do it as a conscious ADR, not by accident.

- **C2 — Provenance is spread thin.** Provenance lives across `source` labels, `citations` jsonb, `evidence_links.note`, `evidence_chunks`, and `file_reference_tags`. There is no single evidentiary record carrying *(who did it, individual/team, supporting span, confidence+rationale, missing info)* together, which the proposal's §4.3 field list wants. This is additive to fix, not a rewrite.

- **C3 — Orchestrator cargo-cult risk.** The proposal's language ("central coordinator," "handoff," "workflow state") maps onto R1's supervisor/swarm patterns, which are **DORMANT** in the matrix for good reason (single app, no second agent). Building a stateful bus/saga/outbox to satisfy it would be a **rule violation** (CLAUDE.md §2.1), not compliance. R1 is already satisfied *per agent*. A cross-agent layer must be scoped as **composition over the existing `orchestrator.ts` entry points + a surfacing/queue layer**, and needs its own ADR (CLAUDE.md §4).

- **C4 — Claim lifecycle is implicit.** `decision_records.status` has no CHECK and no documented transitions; the real lifecycle is scattered across `record_reviews.status`, review-flag `disposition`, and derived claim status. Fine today; it won't carry a richer lifecycle without being made explicit.

- **C5 — No regression-test harness for the §13 scenarios.** The proposal lists 10 excellent QA scenarios (attribution, metric causation, uncertain recollection, cross-document reconciliation, pressure-to-exaggerate). The agent prompts/logic plausibly handle several already, but there is **no golden-set eval** pinning them. The `ai-evals` skill exists for exactly this. Low-cost, high-value insurance before any model-touching change.

- **C6 — UX/data drift.** The data model moved ahead of the navigation. "Review claims" says `Soon` while claims ship; features are reachable only by knowing sub-routes. Debt, not danger.

No conflict with the guardrails themselves: the existing FSM/DI/Humble-Object pattern is exactly what R1/R3 ask for, and any new agent work should be poured into the same mold.

---

## 5. The most important changes to establish the shared evidence foundation

The foundation is ~80% built. The decisive work is **model clarity**, not volume of new tables. In priority order:

### 5.1 Decide the source / evidence / claim shape (ADR first — the keystone)

Two viable options:

- **Option A — keep the fusion, enrich the record.** One `decision_records` row stays "evidence record = claim." Add the missing structured provenance fields (5.2). Cheapest; preserves everything; but can never express "one piece of evidence, several claims" or "one claim, several evidence records."
- **Option B — introduce a `claims` child table** that references one or more evidence records (and reuse `evidence_links` / a new `claim_evidence` join). Honors §4.4 fully; unlocks the fan-out; larger change; must keep the current `/dashboard` claims projection working during migration.

**Recommendation:** write the ADR to **choose B's *data shape* but phase it in behind A's *current behavior*** — i.e. add the `claims` table and a `claim_evidence` link, backfill one claim per existing decision record (preserving today's UX), and only *then* allow multi-evidence claims. This keeps the live profile working on day one and makes the separation real without a big-bang cutover. Decide this with `design-review` → `adr-writing` before any migration.

### 5.2 Add structured provenance to the evidence record (additive migrations)

- **Actor attribution** (P2): a structured field on the evidence record — e.g. `contribution text CHECK in ('individual','team','project')` + optional `attribution_note`. This is what makes Tests 1 & 3 enforceable.
- **Supporting span** (P3): on `evidence_links`, add `location text` / `passage text` (page, section, or char range) so a citation points at a span, not just a document.
- **Missing info** (§4.3): a first-class `missing_info text[]` or a lightweight `investigation_items` concept (which doubles as the Investigation Queue's backing store — see 5.4).
- **Confidence on the record** vs on satellites: keep confidence where it is (gap assessments, review flags, file tags) but add a derived/rolled-up confidence view on the claim. Don't duplicate.

All additive, own-rows RLS inherited, no live-data rewrite — the same pattern as ADR-0015/0019.

### 5.3 Make the claim lifecycle explicit (P4/C4)

Add a documented `status` CHECK and a pure `src/lib/claims/lifecycle.ts` reducer mapping evidence + review state → lifecycle. Keep it computed where possible (consistent with ADR-0012/0015's "computed over stored" stance).

### 5.4 Stand up the Investigation Queue backing store (§8)

Introduce a lightweight `investigation_items` table (what's unknown, why it matters, which project/claim/requirement it affects, suggested next action: interview / upload / confirm). **Most of its rows can be *derived* from signals that already exist:** `requirement_gap_assessments.verdict in ('unknown','gap')`, `record_review_flags` with open disposition, `files.analysis_status='needs_review'`, paused `interview_sessions`, claims with no `evidence_links`. Start by deriving; persist only what needs user state. This is the concrete, buildable form of "the orchestrator decides what's next."

### 5.5 Everything else rides on the above

Project workspace, evidence health, connected UX, and the orchestrator all consume 5.1–5.4. Do not build them first.

---

## 6. How the proposed agents should interact with the existing architecture

**Map the five proposed agents onto what exists — four already map 1:1; only the orchestrator is net-new.**

| Proposal agent | Maps to | Interaction model |
|---|---|---|
| Evidence Intelligence Agent | `src/lib/file-analysis/` | **Extend, don't replace.** Keep the FSM + grounding. Add two outputs: a **proposed project** and **proposed evidence records** (structured, each with attribution + citations), plus a **reconciliation step** that cross-checks new docs against existing `evidence_chunks` and emits conflict flags. Persist via the existing deterministic `decision-records/save` + `evidence_links`. |
| Career Discovery & Interview Agent | `src/lib/interview/` | **Mostly reuse.** Already adaptive, grounded, timeline-aware, HITL. Add: emit **learning-moment proposals** (P7); make it **launchable from an Investigation Queue item** with the item's context pre-loaded. |
| Career Mapping Agent | `src/lib/gap/` + `src/lib/investigation/` + `target-roles` | **Reuse.** Reframe the four verdicts in the UX as Demonstrated/Partial/Unverified/Development (P8) and route "Unverified" to the Investigation Queue rather than to course recommendations. |
| Claim Validation & Quality Agent | `src/lib/reviewer/` | **Reuse as-is.** Already the skeptical grounded gate. Feed its open flags into the Investigation Queue and the claim lifecycle ("challenged"). |
| **Career Intelligence Orchestrator** | **Net-new, thin** | **Composition, not a runtime.** A `src/lib/orchestrator/` module that (a) reads shared state to decide the next useful step, (b) calls the existing per-agent `orchestrator.ts` entry points, (c) tracks workflow position, and (d) populates the Investigation Queue. **It must not re-implement any agent's reasoning** — the proposal itself says this (§5.2) and the anti-cargo-cult clause requires it. No bus, no saga, no outbox, no LangGraph. If it needs any durable multi-step state, model it as the existing discriminated-union-state + pure-router pattern (R1, in force) and record an ADR activating the R1 supervisor row. |

**The interaction contract already exists and is correct:** every agent returns **structured proposals**; **deterministic services validate + persist**; **HITL approval** gates every side effect (R1 §3.4, already enforced). The orchestrator slots in *above* this contract, not inside it. Shared state is the Supabase tables + RAG, exactly as today — that is the app's "state bus."

---

## 7. Phased implementation plan (preserves working functionality)

Each phase is independently shippable and leaves the app working. Phases map to the proposal's §10 roadmap but re-grounded in what's actually left to do.

### Phase 0 — Model decision (design only, no code)
- `design-review` → ADR for **source/evidence/claim separation** (§5.1, decision P1) and the **claim lifecycle** (§5.3).
- `ai-evals` golden set encoding the §13 Tests 1–10 as regression scenarios (C5) — baseline the current agents before changing them.
- **Exit:** approved ADR(s) + a red/green eval baseline. Nothing in prod changes.

### Phase 1 — Harden the shared foundation (additive migrations)
- Add structured **attribution** (P2), **supporting span** on `evidence_links` (P3), **missing-info / `investigation_items`** store (5.4), **claim lifecycle** CHECK + pure reducer (P4).
- If ADR chose Option B: add `claims` + `claim_evidence`, backfill one-claim-per-record so `/dashboard` is unchanged.
- `supabase-data` dry-run → apply; `test-planning` for the pure reducers (80% floor).
- **Exit:** richer model, identical UX. Everything that worked still works.

### Phase 2 — Ingestion becomes discovery (extend File Analysis)
- Extend `src/lib/file-analysis/` to **propose a project + structured evidence records** (P5) and run an **ingest-time cross-document reconciliation / conflict pass** (P6) over existing `evidence_chunks`.
- All new outputs go through the existing HITL review → deterministic persist path. No auto-commit.
- Re-run the Phase 0 evals (esp. Tests 5 & 7).
- **Exit:** "upload 7 docs → proposed project + evidence + flagged conflicts," the proposal's §7 steps 1–4, with the user still approving everything.

### Phase 3 — Connected surface (read/UX layer, no new agents)
- **Investigation Queue** (§8) derived from existing signals + `investigation_items`; each item deep-links into the right existing agent.
- **Project Workspace** tabs (§6.2) over existing data.
- **Evidence health** indicators (§6.6); reframe **Gap Check** as four categories (P8); wire **"Review claims"** nav (P10); interview emits **learning moments** (P7).
- `ui-accessibility` for all new UI.
- **Exit:** the "connected intelligence" experience — still powered entirely by the agents that already exist.

### Phase 4 — Thin orchestration (only if Phase 3 proves it's needed)
- `src/lib/orchestrator/` composition layer (§6) + ADR activating the R1 supervisor row. Sequences existing entry points; no new reasoning, no distributed machinery.
- **Exit:** end-to-end upload→reconcile→propose→interview→review→map flow the user can let run, reviewing at each gate.

**Sequencing rule:** 0 → 1 are prerequisites; 2 and 3 can overlap once 1 lands; 4 is optional and last. Do **not** start with UI or with the orchestrator (CLAUDE.md §15, proposal §15 agree on this).

---

## 8. What NOT to do (guardrail reminders)

- **Don't** build LangGraph, a message broker, sagas, an outbox, CDC, or fencing tokens for the orchestrator. The matrix keeps them DORMANT; adding them is a rule violation (CLAUDE.md §2.1).
- **Don't** let the orchestrator duplicate agent reasoning — it composes, it doesn't think (§5.2, §6).
- **Don't** create a second `claims` table *unless* the ADR concludes the evidence→claim fan-out is really wanted (§5.1); if not, enrich the existing record instead.
- **Don't** change any model-touching code without re-running the Phase 0 eval baseline (C5).
- **Don't** rewrite the four working agents, the RAG layer, or the LLM gateway — they already satisfy R1/R3.

---

## 9. One-paragraph summary

You are not evolving a prototype toward this architecture — you are **most of the way there already.** The evidence record, polymorphic source links, projects, closed-RAG cross-document retrieval, four FSM agents, HITL gates, and the capped/validated LLM gateway all exist and should be preserved. The real work is **conceptual, not volumetric**: decide (via ADR) whether to split *evidence record* from *claim*, add the handful of structured provenance fields the proposal's attribution and §13 tests require, stand up an **Investigation Queue** from signals you already compute, and wrap the existing agents in a **thin composition + surfacing layer** — explicitly *not* the heavyweight orchestrator the proposal's language implies, which the guardrails forbid. Start with the model ADR and an eval baseline; let every later phase ride on that.
