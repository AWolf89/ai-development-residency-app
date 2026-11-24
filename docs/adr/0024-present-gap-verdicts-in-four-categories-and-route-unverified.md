---
status: accepted
date: 2026-11-23
decision-makers: Amanda Wolf
---

# 0024. Present gap verdicts in four evidence categories and route unverified to investigation

## Context and Problem Statement

[ADR-0012](0012-present-gap-verdicts-in-three-buckets-computed-on-demand.md)
folded the backend's four stored verdicts ([ADR-0011](0011-classify-evidence-against-role-requirements-with-a-grounded-four-verdict-schema.md):
`met` · `partial` · `gap` · `unknown`) into **three** display buckets to match the
original Figma screen: _Supported_ (met + partial), _Undocumented_ (unknown), and
_True gap_ (gap).

The MVP 2 foundation plan (`docs/evidence-foundation-assessment.md` §6.5, row P8)
reframes the gap check around a core product promise: **a lack of evidence is not a
lack of skill.** Two problems follow from the three-bucket mapping:

1. **"Supported" hides the difference between full and partial coverage.** Folding
   `partial` into _Supported_ means the chip alone cannot tell a fully demonstrated
   requirement from a partially demonstrated one — exactly the distinction a job seeker
   needs when deciding what to shore up.
2. **"Undocumented" points at the wrong next step.** `unknown` means _no evidence was
   retrieved_, not _no skill_. The three-bucket next step sends the user to upload a
   file, which reads as "go get qualified" rather than "let's find what you've already
   done." With the Investigation Queue now shipped
   ([Investigation Queue](../../src/lib/investigations/)), an unverified requirement
   should route to **investigation**, never toward training or a hiring verdict.

This is a presentation decision for one Next.js + Supabase app. It changes no backend
contract, no stored schema, and adds no model path (CLAUDE.md anti-cargo-cult clause);
it supersedes only the display mapping in ADR-0012.

## Decision Drivers

* Make "missing evidence ≠ missing skill" explicit in the UI, not implied
* Give `partial` its own category so a chip never overstates or understates coverage
* Route `unknown` to investigation (or the discovery interview), never to a course or a hiring verdict
* Keep every stored verdict faithfully represented — the UI only re-labels, never invents coverage
* Reuse the existing shell, `StatusChip`, tones, and the on-demand run trigger from ADR-0012 (stay additive)
* Keep the mapping as pure, unit-tested logic behind the React boundary (CLAUDE.md §3)

## Considered Options

* Four evidence categories (Demonstrated, Partially demonstrated, Unverified, Development opportunity), one per verdict, with unverified routed to investigation
* Keep the three buckets from ADR-0012 and only change the copy and the next-step link
* Four categories plus a stored "promotion" state that records when an unverified requirement has been investigated
* Replace the categories with a single numeric readiness score

## Decision Outcome

Chosen option: "Four evidence categories (Demonstrated, Partially demonstrated, Unverified, Development opportunity), one per verdict, with unverified routed to investigation", because it gives each stored verdict an honest, distinct label, makes the "evidence gap ≠ skill gap" framing legible at a glance, and sends an unverified requirement to the investigation flow this app already has — all without touching the backend or adding stored state the feature does not need.

1. **Verdict → category (pure).** `met` → **Demonstrated** (green); `partial` →
   **Partially demonstrated** (blue); `unknown` → **Unverified** (orange); `gap` →
   **Development opportunity** (gray). Tones reuse the existing `StatusChip` tokens.
2. **Summary tiles.** Four tiles count requirements per category, over only the
   requirements that have been assessed.
3. **Next-step column (pure).** _Demonstrated_ and _Partially demonstrated_ show the
   validated citation(s); _Unverified_ shows an **investigate-before-you-judge** next
   step that points at investigation, not at a file upload or a course; _Development
   opportunity_ shows the honest rationale and still offers investigation, never a
   "not qualified" verdict.
4. **Explicit framing (UI copy).** The page states plainly that missing evidence is not
   proof of a missing skill, and that unverified requirements are worth investigating
   before being treated as gaps.
5. **No stored promotion state.** A requirement moves between categories only by being
   re-assessed (the existing on-demand run from ADR-0012); investigation that surfaces
   new evidence changes the verdict on the next run. No new column or migration.
6. **No backend change.** The four-verdict schema, the table, the model path, and the
   on-demand run trigger from ADR-0012 are untouched; this decision lives in the pure
   mapping module and the page.

### Consequences

* Good, because each stored verdict now has a distinct, honest label; a chip never conflates full with partial coverage.
* Good, because the "evidence gap ≠ skill gap" promise is stated in the UI and enacted by routing `unknown` to investigation rather than training.
* Good, because the mapping stays pure and unit-tested to the 80% floor; the page stays a thin, logic-free boundary (CLAUDE.md §3).
* Good, because it reuses the shipped Investigation Queue and the ADR-0012 on-demand run; it is purely additive and adds no model path or migration.
* Bad, because the category of an investigated requirement is only as fresh as the last run — it can read stale until the user re-runs the gap check; mitigated by the visible "Re-run gap check" action.
* Bad, because without a stored "investigated" flag the UI cannot show "promoted after investigation" history; accepted for now as unneeded complexity (a future ADR can add it if the history becomes valuable).

## More Information

Supersedes [ADR-0012](0012-present-gap-verdicts-in-three-buckets-computed-on-demand.md).
Realises `docs/evidence-foundation-assessment.md` §6.5 (P8) and is covered by the
deterministic agent-reasoning eval gate's §13 Test 10 (evidence gap ≠ skill gap; no
binary hiring verdict), which exercises the unchanged gap *agent*. R1 agent orchestration
stays dormant for this card; it is one page and a pure mapping module.
