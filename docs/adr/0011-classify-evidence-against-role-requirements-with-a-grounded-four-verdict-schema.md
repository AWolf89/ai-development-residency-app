---
status: proposed
date: 2026-11-14
decision-makers: Amanda Wolf
---

# 0011. Classify evidence against role requirements with a grounded four-verdict schema

## Context and Problem Statement

Build order 10, **Gap Classification**, is the classification half of the job-seeker
"Evidence vs. Requirements Gap Check". It consumes the just-merged Evidence Search Pipeline
v1 ([ADR-0010](0010-use-pgvector-for-closed-rag-retrieval-over-reference-and-evidence.md)):
for each `role_requirements` row of a user's target role it must decide whether the user's
own evidence satisfies that requirement, and say so **honestly** — never inventing coverage
the evidence does not show.

The hard questions are modelling questions, costly to change once stored and surfaced:

1. **What verdicts exist?** A naive met/not-met split hides the difference between "the
   evidence shows this requirement is missing" and "there is no evidence on file to judge at
   all". Conflating them would let the app assert a gap it cannot support, or — worse — guess
   coverage.
2. **How is a verdict kept grounded?** An LLM asked to classify will, left alone, assert
   coverage from its own general knowledge and cite sources that were never retrieved.
3. **Is this an agent?** R1 (multi-agent/FSM orchestration) is **DORMANT until Week 6** per
   the [applicability matrix](../../.claude/rules/README.md). This feature must not
   pre-build an agent loop to do a per-requirement classification.

This realises the retrieval→answer direction of ADR-0010 for the gap-check use case,
translated to this one Next.js + Supabase app (CLAUDE.md anti-cargo-cult clause: no
LangGraph, no FSM, no second model path).

## Decision Drivers

* Be honest about gaps: "no evidence found" must be distinct from "evidence shows a gap"
* Never invent coverage — every "met"/"partial" verdict must rest on a real, retrieved citation
* Closed-RAG: classify only from retrieved, cited evidence/reference text, or refuse
* One model path: reuse `runStructured`, `wrapUntrusted`, and `llm_runs` (no second gateway)
* Not an agent: one structured call per requirement, not an FSM loop (R1 dormant until Week 6)
* Pure, testable decision logic behind a thin, mockable model/retrieval boundary (CLAUDE.md §3)
* Additive only: do not change the retrieval pipeline or the gateway; any table is additive with own-rows RLS
* Defend against prompt injection in retrieved/user text (OWASP LLM01)

## Considered Options

* Four-verdict grounded schema (met/partial/gap/unknown) with a deterministic no-evidence short-circuit and citation validation
* Three-verdict schema (met/partial/gap) with the model deciding the no-evidence case
* Binary met / not-met verdict
* A numeric coverage score (0–100) returned by the model

## Decision Outcome

Chosen option: "Four-verdict grounded schema (met/partial/gap/unknown) with a deterministic no-evidence short-circuit and citation validation", because it keeps the honest distinction between "no evidence to judge" and "evidence shows a gap", takes the no-evidence case away from the model entirely so coverage can never be hallucinated, and verifies every claimed citation against what was actually retrieved before a verdict is trusted.

1. **Four verdicts.** `met` · `partial` · `gap` · `unknown`. `unknown` means no evidence was
   retrieved (cannot assess); `gap` means evidence was retrieved but does not cover the
   requirement. The model emits only `met | partial | gap`; `unknown` is set by our code.
2. **Deterministic no-evidence short-circuit (pure).** For each requirement we call
   `retrieveEvidence(requirement_text)`. If it returns `found: false` (the
   `NO_MATCHING_EVIDENCE_DATA` sentinel), we return `unknown` with no citations and **make no
   model call** — zero cost, zero hallucination surface.
3. **One structured call when evidence exists.** Otherwise one `runStructured` call
   (purpose `extract`) with a Zod schema returning `{ verdict, rationale, citations[] }`. The
   retrieved evidence context, optional reference context, and the requirement text are each
   `wrapUntrusted()`-wrapped before entering the prompt.
4. **Citation validation + downgrade (pure).** Each returned citation is checked against the
   union of actually-retrieved sources; invented citations are dropped. A `met`/`partial`
   verdict left with zero valid citations is downgraded to `gap` — coverage must be
   substantiated.
5. **Additive persistence.** Results are stored in a new `requirement_gap_assessments` table
   (own-rows RLS, mirroring existing policies), recording the verdict, rationale, validated
   citations, whether evidence was found, and the model/prompt version used.

### Consequences

* Good, because a no-evidence requirement can never be reported as met coverage — the model never sees it.
* Good, because every trusted "met"/"partial" verdict is backed by a citation that was really retrieved.
* Good, because it stays within one model path and one database, with pure decision logic unit-tested to the 80% floor.
* Good, because `unknown` gives the UI an honest, actionable "add evidence" state separate from a real gap.
* Bad, because four verdicts plus a downgrade rule are more logic to maintain and explain than a binary met/not-met.
* Bad, because a per-requirement call means N model calls for N requirements (cost scales with role size); mitigated by the no-evidence short-circuit and the cheap `extract` model, and batching remains a future option.
* Bad, because the quality of a `met`/`gap` call still depends on retrieval recall; a real but unretrieved piece of evidence yields `unknown`, not `met`.

## More Information

Builds directly on [ADR-0009](0009-use-openrouter-and-the-vercel-ai-sdk-as-the-model-gateway.md)
(gateway) and [ADR-0010](0010-use-pgvector-for-closed-rag-retrieval-over-reference-and-evidence.md)
(retrieval). Realises the "R3 schema validation / closed RAG" direction of the
[applicability matrix](../../.claude/rules/README.md) for classification; R1 agent
orchestration stays dormant. Design notes:
`docs/design/gap-classification.md`.
