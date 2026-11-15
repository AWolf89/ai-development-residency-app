# Test Plan — Gap Classification

Size: **medium feature** (design approved: [gap-classification.md](../design/gap-classification.md),
[ADR-0011](../adr/0011-classify-evidence-against-role-requirements-with-a-grounded-four-verdict-schema.md)).
Testing strategy was part of the approved design; this records the critical paths and cases.

## Framework & external services

- **Framework:** Vitest (pure logic, repo default) + `tsx --conditions=react-server` for the
  server-only boundary (matches `tests/rag/`, `tests/llm/`). No new framework.
- **External services:** never hit live OpenRouter or Supabase. Retrieval, the model call,
  the run sink, and DB inserts are injected fakes. Rule 1: no production data, keys, or
  accounts in any test.

## Critical paths (100% coverage target)

1. **No-evidence short-circuit** — `classify.ts`: when `retrieveEvidence` returns
   `found: false`, the verdict is `unknown`, **no model function is called**, and no
   citations are produced. This is the honesty guard: a requirement with no evidence can
   never be guessed into coverage.
2. **No invented coverage** — `classify.ts`: every citation the model returns is validated
   against the actually-retrieved sources; invented ones are dropped, and a `met`/`partial`
   verdict left with zero valid citations is downgraded to `gap`. Coverage must rest on a
   real citation.

## Cases

### `classify.ts` (pure + injected deps, Vitest)
- evidence not found → `unknown`, model fn **not called** (spy), no citations, `evidenceFound:false` ·
- evidence found, model `met` with a citation that matches a retrieved source → `met`, citation kept ·
- model returns a citation absent from the retrieved sources → that citation dropped ·
- model `met` with only invented citations → downgraded to `gap` ·
- model `partial` with zero citations → downgraded to `gap` ·
- model `gap` → stays `gap` (no citation required; nothing to substantiate) ·
- reference context is retrieved and passed into the model input when evidence exists ·
- `attempts` / `truncated` from the model result are propagated onto the `RequirementGap` ·
- `classifyRequirements` maps over several requirements in order, short-circuiting per item.

### `validateCitations` / mappers (pure, Vitest)
- keeps source+id matches, drops non-matches, dedups duplicates ·
- `toAssessmentRow` maps a `RequirementGap` + ids to the DB row shape (verdict, rationale,
  citations jsonb, evidence_found, model_used, prompt_version).

### `types.ts` (pure, Vitest)
- model-output Zod schema accepts a valid payload; rejects a bad verdict, a missing field,
  and a malformed citation · verdict enum has exactly the four values.

### `prompts/gap-classification.ts` (pure, Vitest)
- `render` wraps evidence, reference, and requirement in untrusted tags and includes each ·
- system prompt states the closed-grounding rules (data-not-instructions, cite source+id,
  never invent coverage) · stable `id` + semver `version`, purpose `extract`.

### `classifier.ts` (boundary, tsx under `tests/gap/`)
- wires a fake retriever + fake `runStructured` + fake sink: on no evidence it short-circuits
  without calling the model; on evidence it calls the model once and returns the decided
  `RequirementGap`; the save path inserts one `requirement_gap_assessments` row via a fake
  Supabase client (RPC/insert error surfaced).

## Cards
Covered by the single board card **Gap Classification** (build order 10); the build
breakdown is in the design's Kanban-cards section.
