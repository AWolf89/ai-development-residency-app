---
status: accepted
date: 2026-11-24
decision-makers: Amanda Wolf
---

# 0027. Simplify the dashboard navigation into four primary sections

## Context and Problem Statement

The signed-in shell (`src/app/dashboard/layout.tsx` + `src/components/Sidebar.tsx`)
exposes **eight** flat sidebar destinations — Upload files, Projects, Review claims,
Interview, Learning moments, Gap check, Investigations, My profile — with no grouping.
Several of them hold the same kind of thing (Projects, Claims, Learning moments and
uploaded files are all _accumulated evidence_), and two of them show the **same data**:
the Gap Check and a per-requirement evidence view both read
`requirement_gap_assessments`. The flat list makes the app read as a pile of tools
rather than a few clear places, and it has grown by one item per feature shipped.

This is an information-architecture decision for one Next.js + Supabase app. It must not
require relocating data, rewriting the features, or breaking existing links (CLAUDE.md
§5 process, minimal-disruption). The question: **how should the top-level navigation be
structured so it stays legible as features keep landing, without disrupting the routes
and pages that already work?**

## Decision Drivers

* Reduce the number of top-level choices so the shell stays legible as features grow.
* Group destinations by what the user is doing (accumulating evidence vs. describing a
  target vs. acting on gaps), not by which feature built them.
* Preserve every existing route and deep link — bookmarks and internal links must keep
  working (minimal disruption; a grouping change, not a data move).
* Reuse the existing pages and components under the new grouping; add no model path, no
  migration, no new stored state (CLAUDE.md anti-cargo-cult clause).
* Keep "one dataset, one destination" — the same data should not be reachable as two
  sibling destinations.
* Keep navigation accessible: a labelled `nav`, a working mobile drawer, correct
  active-state resolution.

## Considered Options

* Four primary sections with in-page tabs, existing routes preserved via redirects
* Keep the eight flat destinations, renamed and reordered
* Reduce to four by physically relocating routes under new paths
* Replace the sidebar with a four-section top navigation bar

## Decision Outcome

Chosen option: "Four primary sections with in-page tabs, existing routes preserved via redirects", because it collapses eight destinations to four along lines the user
actually thinks in, while leaving the routes, pages, and data exactly where they are —
the grouping is new chrome plus redirects, not a rewrite.

1. **Four primary sidebar sections.**
   * **Guided Flow** — the orchestrated upload-to-record workflow (surfaces the existing
     orchestrator from [ADR-0026](0026-compose-the-agents-with-a-thin-supervisor-fsm-over-existing-entry-points.md))
     as the primary entry point.
   * **Evidence Library** — Projects · Claims · Learning moments · Sources (uploaded
     files), as tabs over the existing pages.
   * **Career Profile** — Profile · Target roles, as tabs; Target roles hosts the
     readiness view.
   * **Investigations** — unchanged; stays its own destination because it is an action
     queue, not a library.
2. **Secondary navigation is in-page tabs**, deep-linkable via a query param, composing
   the existing page content unchanged.
3. **Routes are preserved.** Every current path keeps resolving; old paths redirect to
   the matching section/tab, so bookmarks and existing internal links keep working.
4. **"One dataset, one destination."** Because the Gap Check and a per-requirement
   evidence view compute from the same `requirement_gap_assessments` data, the Gap Check
   is folded into the Career Profile → Target roles view rather than remaining a separate
   sibling. (The internals of that merged readiness view — the evidence meters, the
   per-role roll-up by the four categories from [ADR-0024](0024-present-gap-verdicts-in-four-categories-and-route-unverified.md),
   the `/dashboard/gap-check` redirect — are a separable decision recorded in its own ADR
   when that work is built.)
5. **No backend change.** No table, no migration, no model path, no new stored state;
   this decision lives in the sidebar, thin tab-shell pages, and redirects.

### Consequences

* Good, because eight top-level choices become four grouped by task, which lowers the
  cognitive load of the shell and gives it room to absorb future features without
  growing the sidebar.
* Good, because preserving routes and redirecting old paths makes the change additive and
  low-risk — bookmarks keep working and the existing pages are reused rather than
  rewritten.
* Good, because the "one dataset, one destination" rule removes the Gap-Check/Target-Roles
  duplication, so a user is never shown the same coverage data in two places.
* Good, because Investigations stays a first-class destination, keeping the "act on your
  gaps" path one click away.
* Bad, because grouping adds a navigation level: items that were one click (e.g. Claims)
  become section-then-tab. Mitigated by deep links straight to a tab and by sensible
  default tabs, so the common path is still effectively one click.
* Bad, because `My profile` today doubles as the app's landing page (`/dashboard`); with
  Guided Flow as the primary entry point, the landing destination is reassigned — a
  visible behavioural change that must be confirmed as each shell lands.
* Bad, because the migration spans several PRs (sidebar, Evidence Library shell, Career
  Profile shell, redirects), so there are interim states where the nav and the pages are
  only partly regrouped; mitigated by landing the sidebar first against existing routes.

### Confirmation

Enforced by review, not an automated rule: each navigation/shell PR in this initiative
is checked against this ADR — exactly four primary sidebar sections, secondary items as
tabs, and a redirect for every route it moves behind a tab (no removed or orphaned
route). A regex fitness function is deliberately not added: the meaningful invariants
(four sections, every old route still resolves) are structural and routing-level, not a
forbidden string, so a brittle regex would give false confidence. The tracking cards
for this initiative live in the CEA Backlog (the "IA: collapse the sidebar…",
"Evidence Library…", "Career Profile…", and "Merge Gap Check into…" cards).

## Pros and Cons of the Options

### Four primary sections with in-page tabs, existing routes preserved via redirects

* Good, because it cuts eight destinations to four grouped by task.
* Good, because routes stay put; old links redirect, so nothing breaks and pages are reused.
* Good, because it enforces "one dataset, one destination" (folds Gap Check into Target roles).
* Bad, because it introduces a second navigation level (section → tab) for some items.

### Keep the eight flat destinations, renamed and reordered

* Good, because it is zero work and nothing can break.
* Bad, because the shell keeps growing one item per feature and stays a flat tool pile.
* Bad, because it leaves the Gap-Check/Target-Roles data duplication in place.

### Reduce to four by physically relocating routes under new paths

* Good, because the URL structure would mirror the new grouping exactly.
* Bad, because it rewrites every internal link and breaks existing bookmarks — high
  disruption for a presentation change, against the minimal-disruption driver.
* Bad, because it risks a large, hard-to-review change touching many files at once.

### Replace the sidebar with a four-section top navigation bar

* Good, because a four-item top bar is compact.
* Bad, because it discards the existing navy sidebar shell and its design-system styling
  for no functional gain, and gives secondary tabs nowhere natural to live on narrow
  screens.

## More Information

Mockups of all four sections and the merged Target Roles dashboard:
[CEA — Guided Flow Wizard (Figma)](https://www.figma.com/design/yGW3BxiQaUj3xfaz4sdHGj/CEA-%E2%80%94-Guided-Flow-Wizard--mockup-).

Relates to [ADR-0024](0024-present-gap-verdicts-in-four-categories-and-route-unverified.md)
(the four-category gap verdicts the merged Target Roles view presents) and
[ADR-0019](0019-add-projects-as-a-cross-cutting-organising-entity-and-file-detail-hub.md)
(Projects, grouped under Evidence Library). The internals of the Gap-Check →
Target-Roles merge get their own ADR when that card is built. Revisit if a fifth
primary section is ever proposed — that is the signal the four-way grouping no longer
holds and should be rethought rather than extended.
