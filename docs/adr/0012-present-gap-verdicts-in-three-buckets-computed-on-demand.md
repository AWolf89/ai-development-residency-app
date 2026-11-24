---
status: superseded by ADR-0024
date: 2026-11-15
decision-makers: Amanda Wolf
---

# 0012. Present gap verdicts in three buckets, computed on demand

## Context and Problem Statement

The Gap Classification backend ([ADR-0011](0011-classify-evidence-against-role-requirements-with-a-grounded-four-verdict-schema.md))
stores a four-verdict result per requirement — `met` · `partial` · `gap` · `unknown`.
The Figma prototype for the Gap Check screen shows **three** status chips —
_Supported_, _Undocumented_, and _True gap_ — plus a three-tile summary and a
requirements table. Turning the stored verdicts into that screen raises two questions
that are costly to change once users see them:

1. **How do four verdicts map to three chips?** `partial` has no chip of its own in the
   prototype, and `unknown` (no evidence retrieved) must read as something a user can act
   on — not as a failure.
2. **When does classification run?** Each requirement costs one LLM call
   ([ADR-0011](0011-classify-evidence-against-role-requirements-with-a-grounded-four-verdict-schema.md)).
   Running the whole role on every page visit would spend tokens the user did not ask to
   spend and make navigation slow and non-deterministic.

This is a presentation + trigger decision for one Next.js + Supabase app; it changes no
backend contract and adds no model path (CLAUDE.md anti-cargo-cult clause).

## Decision Drivers

* Match the prototype's three-bucket vocabulary without hiding or overstating a verdict
* Keep "no evidence to judge" (`unknown`) honest and actionable, distinct from a real gap
* Never report coverage the backend did not substantiate — the UI only re-labels verdicts
* Control cost: an LLM call per requirement must be a deliberate user action, not a side effect of navigation
* Reuse the existing shell, `StatusChip`, tokens, and queries; stay additive
* Keep the mapping as pure, unit-tested logic behind the React boundary (CLAUDE.md §3)

## Considered Options

* Three presentation buckets (Supported = met+partial, Undocumented = unknown, True gap = gap) with classification computed on an explicit run
* Four chips, one per verdict, exposing `partial` as its own status
* Auto-run classification on every page load and render the result inline
* Collapse everything to a single numeric readiness score

## Decision Outcome

Chosen option: "Three presentation buckets (Supported = met+partial, Undocumented = unknown, True gap = gap) with classification computed on an explicit run", because it matches the prototype exactly, keeps every verdict honestly represented (a `partial` still rests on a real citation, so it belongs under _Supported_ with its nuance shown in the evidence column — not demoted to _Undocumented_, which asserts no file exists), and makes the per-requirement token spend a deliberate click rather than a navigation side effect.

1. **Verdict → bucket (pure).** `met` and `partial` → **Supported** (green); `unknown` →
   **Undocumented** (orange); `gap` → **True gap** (gray). The chip tones reuse the existing
   `StatusChip` tokens. A `partial` is labelled as partial in the evidence column so the
   green chip never overstates fullness.
2. **Summary tiles.** The three tiles count requirements per bucket, over only the
   requirements that have been assessed.
3. **Evidence / next-step column (pure).** _Supported_ shows the validated citation(s)
   ("<title> · N sources"); _Undocumented_ shows an actionable next step (add a file or do
   an interview); _True gap_ shows the honest "no evidence or recollection found".
4. **On-demand trigger.** The page renders the saved `requirement_gap_assessments` rows.
   Classification runs only when the user presses **Run / Re-run gap check**, via a Server
   Action that calls the existing `classifyRoleRequirements` + `saveAssessments`. No
   classification happens on page load.
5. **No backend change.** The four-verdict schema, the table, and the model path are
   untouched; this decision lives entirely in a pure mapping module and the page.

### Consequences

* Good, because the screen matches the prototype while every stored verdict stays faithfully represented.
* Good, because `unknown` surfaces as an actionable "Undocumented" state, not a failure, matching the product's honest framing.
* Good, because token spend is a deliberate user action, keeping navigation fast, cheap, and deterministic (R3 cost discipline).
* Good, because the mapping is pure and unit-tested to the 80% floor; the page and Server Action stay thin, logic-free boundaries.
* Bad, because folding `partial` into _Supported_ means the chip alone does not distinguish full from partial coverage; mitigated by labelling partials in the evidence column.
* Bad, because an explicit-run model can show stale results after evidence changes until the user re-runs; mitigated by a visible "Re-run gap check" action.
* Bad, because the richer per-requirement next-step deep-links (Interview, upload-for-this) depend on flows not yet built; v1 shows honest text and links upload to the files page.

## More Information

Realises the UI for [ADR-0011](0011-classify-evidence-against-role-requirements-with-a-grounded-four-verdict-schema.md)
against the Figma Career Evidence Agent prototype (screen "04 Gap check"). Reuses the
shell and design system recorded as the project's UI direction. R1 agent orchestration
stays dormant; this is one page, one Server Action, and a pure mapping module.
