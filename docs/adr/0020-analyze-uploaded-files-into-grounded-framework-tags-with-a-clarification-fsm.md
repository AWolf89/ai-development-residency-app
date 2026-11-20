---
status: proposed
date: 2026-11-20
decision-makers: Amanda Wolf
---

# 0020. Analyze uploaded files into grounded framework tags with a human-in-the-loop clarification FSM

## Context and Problem Statement

Today an uploaded file becomes searchable evidence only if plain text can be pulled out of
it: `extractText` reads text/Markdown/CSV/PDF/DOCX and returns `""` for images and anything
else ([`src/lib/files/extract.ts`](../../src/lib/files/extract.ts)). That text is chunked,
embedded, and stored in `evidence_chunks`; the Gap Check retrieves over those chunks
([ADR-0010](0010-use-pgvector-for-closed-rag-retrieval-over-reference-and-evidence.md),
[ADR-0011](0011-classify-evidence-against-role-requirements-with-a-grounded-four-verdict-schema.md)).

Two consequences fall out of this:

1. **Image evidence is invisible.** A journey-map screenshot, a diagram, or a Figma export is
   stored but indexes **no** searchable text, so the Gap Check cannot see it at all. This is
   exactly the surprise that motivated the feature: a "Customer Experience Mapping" map
   uploaded as an image produced a *True gap*.
2. **No structured layer.** Even readable files are only raw text in a search index. Nothing
   says *this file evidences the skill "Customer Journey Mapping", is a deliverable, belongs to
   project X, and supports requirement Y*. The user cannot see what a file "counts for", and
   the Gap Check cannot cite a file by the competency it demonstrates.

We want every file to be **readable** (images included) and **analyzed into structured,
grounded tags** drawn from the fixed `reference_items` vocabulary (the Tech Fleet Skills &
Practices Framework — skills, practices, deliverables, milestones, duties, job-functions — and
O*NET), stored as visible file→item links **and** folded back into the evidence index so the
Gap Check retrieves and cites files fully.

**This introduces the app's first vision model call and a new structured-analysis call**, so the
R3 runtime-defense rows and the Week-4 R3 schema-validation rows of the
[applicability matrix](../../.claude/rules/README.md) apply to this call, and — because the
analysis must not fabricate and must pause for the user when a file is ambiguous — the
already-ACTIVE **R1 FSM/HITL/caps** rows (from
[ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md)) govern it too. The hard
questions are therefore the same as for the other agent loops:

1. **Can analysis invent competencies?** The whole value is grounding. The model must not tag a
   file with a "skill" that is not a real framework/O*NET row.
2. **What happens when a file is ambiguous or thin?** A sparse screenshot could plausibly map to
   several practices. The analysis must *ask* rather than guess — but in a bounded, auditable way
   that never writes tags without the user's approval.
3. **How does a file-level framework tag help a free-text requirement?** `role_requirements` are
   free text (`requirement_text`) with no framework linkage. Tagging a file to a framework skill
   does nothing for the Gap Check unless the two are bridged.

## Decision Drivers

* Grounding is non-negotiable: a tag must point at a real `reference_items` row, validated the
  same way Gap Check citations are validated (ADR-0010/0011) — the model cannot invent a tag.
* Honor the already-ACTIVE R1 FSM/HITL/caps rows by **principle**, in TypeScript — no LangGraph,
  no second service (anti-cargo-cult clause): reuse the interview/investigation pattern (pure
  `reduce(state, event)` router + thin orchestrator).
* Ask-don't-guess must be **structural**: tags persist only on an explicit `accept`, and the
  clarification loop is bounded by a hard question budget and a circuit breaker.
* One model path and one database: reuse the gateway (`runStructured` + `supabaseSink` +
  `llm_runs`, [ADR-0009](0009-use-openrouter-and-the-vercel-ai-sdk-as-the-model-gateway.md)),
  the RAG retriever, `reference_items`, and the existing `extraction_runs` / `file_text` tables.
* Cost stays visible: analysis is a deliberate user action (an "Analyze" button), one model call
  per file, never an auto-run on upload ([ADR-0012](0012-run-the-gap-check-on-demand-as-a-user-action.md)).
* Reuse the existing evidence index for the Gap-Check connection, so retrieval improves with no
  change to the Gap Check itself.

## Considered Options

* Grounded analysis + bounded clarification FSM
  (chosen) — a vision pass reads images into `file_text`; a pure `reduce(state, event)` router
  drives `analyzing → (confident) proposing | (ambiguous) awaiting_clarification → proposing →
  awaiting_review → saving`, with `saving` reachable only from `awaiting_review` on `accept`, a
  hard question budget, and a circuit breaker; tags are validated against the real candidate
  `reference_items` set; accepted tags are written to a new `file_reference_tags` table and an
  enrichment text is indexed into `evidence_chunks`.
* One-shot analysis, no questions
  Analyze in a single call and always auto-propose tags. Simpler, but it either guesses on
  ambiguous files or silently under-tags them — the exact fabrication/over-claiming risk we are
  trying to remove.
* Free-form AI tags (no fixed vocabulary)
  Let the model invent tags per file. Zero setup but tags drift ("journey mapping" vs "customer
  journey"), match the Gap Check poorly, and cannot be grounded — rejected.
* OCR instead of a vision model for images
  Cheaper per image, but OCR reads only printed text; it misses the meaning of a hand-drawn map or
  a mostly-visual diagram, which is most of the evidence that is currently invisible — rejected as
  the primary path.
* Map every requirement to framework items up front
  Solve the bridge by forcing each free-text requirement onto framework rows. High user burden and
  a separate modelling problem; deferred to a stretch card, with enriched evidence text as the
  default bridge.

## Decision Outcome

Chosen option: "Grounded analysis + bounded clarification FSM", because it closes the
image-blindness and no-structure gaps while reusing the app's proven, audited patterns wholesale:
it keeps analysis grounded by reusing citation-style validation, makes ask-don't-guess and the
no-write-without-accept guarantee structural and unit-testable in one pure module, and bridges to
the free-text Gap Check through the existing evidence index without changing the Gap Check.

1. **Read every file.** `extractText` gains a vision branch: image MIME types are sent to a vision
   model through the gateway, producing a text description stored in `file_text`. Unreadable
   non-image types still yield `""`. The vision call carries the R3 caps (`maxOutputTokens`,
   `timeoutMs`, ≤2 correction turns) from ADR-0009 and is logged to `llm_runs`.
2. **Grounded tagging.** A pure analysis module (Humble Object + DI, like `gap/classify.ts`)
   takes the file text, retrieves a candidate set of `reference_items` (the vocabulary), and makes
   one `runStructured` call that selects which items the file evidences, each with a rationale and
   confidence. **Every selected id is validated against the real candidate set**; an id that was
   not a candidate is dropped — the model cannot tag a competency that does not exist.
3. **Ask-don't-guess, bounded (R1 §3.4/§3.5).** `FileAnalysisState` is a typed discriminated
   union; a pure `reduce(state, event)` router transitions it. When confidence is high it goes
   straight to `proposing`; when the file is ambiguous it enters `awaiting_clarification` and asks
   a few targeted questions, capped by a pure `budget_reached` guard (default 3, hard cap higher),
   with a circuit breaker to `paused` on repeated `llm_failed`. The user's answers feed back as
   events. If no confident tags remain after questions, it proposes **none** rather than forcing
   tags — the same "rather say I don't know" contract as the Gap Check.
4. **HITL isolation, structural.** `saving` is reachable **only** from `awaiting_review` on
   `accept`. `edit` stays in review; `reject` discards. A unit test asserts no other transition
   reaches `saving`, so a file is never tagged without an explicit accept.
5. **Attach + index (the Gap-Check bridge).** Accepted tags are written to a new
   `file_reference_tags` table (`file_id`, `reference_item_id`, `entity_type`, `confidence`,
   `rationale`, `user_id`; own-rows RLS, idempotent upsert). The same accept composes an
   enrichment text (file summary + tagged item names/descriptions) and indexes it into
   `evidence_chunks` via the existing evidence indexer — so Gap-Check retrieval improves and can
   cite the file **with no change to the Gap Check**. Mapping free-text requirements directly onto
   framework items is deferred to a stretch card.
6. **Trigger + runs.** A per-file "Analyze" Server Action runs the interactive loop; a batch
   "Analyze all" runs non-interactively, applying only high-confidence tags and marking any file
   that would need questions as **Needs review** for the user to open individually. Each run is
   logged in the existing `extraction_runs` table (status/model/timing/error).

### Consequences

* Good, because image evidence becomes visible for the first time — the exact failure that
  motivated the feature can no longer silently produce a false gap.
* Good, because analysis cannot fabricate: tags are validated against real `reference_items`, so
  an invented competency is impossible by construction, not by prompt-begging.
* Good, because ask-don't-guess and no-write-without-accept are structural (one pure router,
  covered by tests), reusing the interview/investigation pattern so this raises no new standard.
* Good, because the Gap Check improves with no change to its code — the enrichment text lands in
  the corpus it already reads.
* Good, because it stays within one model path, one database, and existing tables, keeping the
  distributed machinery dormant (anti-cargo-cult clause).
* Bad, because a vision call per image and an analysis call per file cost more than the current
  zero-cost extraction; making analysis a deliberate button (not an upload auto-run) keeps that
  cost visible and bounded.
* Bad, because the enriched-text bridge is fuzzy: a file whose tags clearly match a requirement
  may still rank below the retrieval cut-off. The stretch requirement→framework mapping is the
  precise fix when fuzzy matching proves insufficient.
* Bad, because a hand-rolled FSM plus a new table and new UI is more surface area than a one-shot
  analyzer; every new state/event must be added to the union, the router, and the tests together.

## More Information

Builds on [ADR-0009](0009-use-openrouter-and-the-vercel-ai-sdk-as-the-model-gateway.md) (gateway),
[ADR-0010](0010-use-pgvector-for-closed-rag-retrieval-over-reference-and-evidence.md) (retrieval),
[ADR-0011](0011-classify-evidence-against-role-requirements-with-a-grounded-four-verdict-schema.md)
(grounded verdicts + citation validation), and
[ADR-0012](0012-run-the-gap-check-on-demand-as-a-user-action.md) (on-demand, user-triggered);
follows the agent pattern of
[ADR-0013](0013-model-the-reasoning-interview-as-an-explicit-fsm.md) and
[ADR-0017](0017-model-the-evidence-investigation-agent-as-a-bounded-react-retrieval-fsm.md).
Uses the `reference_items` vocabulary from
[ADR-0008](0008-use-a-single-generic-reference-items-table-for-career-framework-data.md) and the
cross-cutting `projects`/file-hub layer from
[ADR-0019](0019-add-projects-as-a-cross-cutting-organising-entity-and-file-detail-hub.md).
Realises the already-ACTIVE R1 FSM/HITL/caps rows and the R3 runtime-defense + schema-validation
rows of the [applicability matrix](../../.claude/rules/README.md), translated to this stack.
Design notes to follow in `docs/design/file-analysis-and-tagging.md`.
