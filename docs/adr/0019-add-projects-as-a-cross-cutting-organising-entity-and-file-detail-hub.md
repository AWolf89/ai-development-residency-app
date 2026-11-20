---
status: proposed
date: 2026-11-19
decision-makers: Amanda Wolf
---

# 0019. Add Projects as a cross-cutting organising entity and a file-detail hub

## Context and Problem Statement

The app captures three kinds of career evidence — uploaded **files**, **decision records**
(the core narrative unit: title, summary, reasoning), and **learning moments** — but nothing ties
them to the real piece of work they came from. A user cannot say "these three files, this decision
record, and that learning moment are all from the same client project, where I was the tech lead."
The result is a flat pile of evidence with no sense of *which project* produced it or *what role*
the user played.

Two user needs follow from this:

1. **Group evidence by project.** The user wants to define the projects they have worked on (with
   their role in each) and assign files, decision records, and learning moments to them, then see a
   rounded, per-project picture.
2. **Document a file.** The user wants to open an uploaded file and say what the deliverable is,
   what role they played, what decisions were made, and which project it belongs to.

Need (2) hides a modelling trap: "role / decisions made / reasoning" is **already** what a
**decision record** is. Capturing that narrative a second time *on the file* would create two
drifting sources of truth and undercut the app's thesis that evidence is a grounded decision
record. So the hard questions are:

- **Where does project grouping live** — a new entity, or overloaded onto an existing table?
- **How much narrative belongs on a file** before it is just a worse decision record?
- **How is per-user ownership preserved** when a client-supplied `project_id` now appears on three
  tables?

## Decision Drivers

* Honour the app's "one narrative home" thesis — do not duplicate decision-record narrative onto files
* Additive and non-destructive — assigning is optional; removing a project must not destroy evidence
* Per-user isolation by RLS, including **cross-table** ownership of the new `project_id` (the
  `evidence_links.file_id` hardening in migration `20261112000019` is the precedent to follow)
* Stay in the stack — one Next.js app, one Supabase DB; no new service, no LLM (R1/R3 runtime rules
  do not apply); apply the rules that are in force now: SOLID / Humble Object and R2 module
  boundaries (CLAUDE.md §3)
* Reuse existing tables unchanged where possible; touch no other feature (interview, gap, reviewer,
  investigation, claims)

## Considered Options

* **A — New `projects` table + three nullable `project_id` FKs (`on delete set null`); file gets
  only a one-line `caption`, and the file page is a hub that attaches/creates decision records and
  assigns a project (Fork B).**
* **B — No new table; reuse `target_roles` (or `decision_records`) as the grouping entity.**
* **C — Fork A: add `description` / `your_role` / `context` / `decisions` narrative columns onto the
  `files` table so a file documents itself.**
* **D — A polymorphic `project_links` join table (one table linking a project to any entity) instead
  of a `project_id` column per table.**

## Decision Outcome

Chosen option: **A** (new `projects` table, three nullable `project_id` FKs with
`on delete set null`, file-detail **hub** with only a `caption`), because it gives project grouping
a first-class home without overloading an unrelated table, keeps all evidence narrative in decision
records (one source of truth), makes assignment optional and project deletion non-destructive, and
enforces ownership with the repo's established RLS `with check` pattern — all within one app and one
database.

1. **New `projects` table.** Per-user, own-rows RLS, `set_updated_at` trigger — identical in shape
   to every sibling table. Fields are light and descriptive: `name`, `role` (the user's role on the
   work), `organisation`, `summary`, `started_on` / `ended_on`, `status` (`active | archived`).
2. **One nullable `project_id` per evidence table.** Added to `files`, `decision_records`, and
   `learning_moments` as `uuid references public.projects (id) on delete set null`, indexed.
   Nullable so assignment is optional; `set null` so deleting a project **detaches** evidence rather
   than deleting it.
3. **Fork B on files.** The only narrative added to `files` is a one-line `caption`. Role, context,
   and decisions are **not** duplicated onto the file; the `/dashboard/files/[id]` page is a hub that
   lets the user set a caption, pick a project, and **attach an existing or create a new decision
   record** (via the existing `evidence_links`). Decision records remain the single narrative store.
4. **Cross-table ownership guard.** Because `project_id` is client-supplied, each of the three
   tables' INSERT and UPDATE policies is replaced to additionally require that `project_id` is null
   or names a project owned by the caller (`with check … exists(select 1 from public.projects …)`),
   mirroring the `evidence_links` hardening. No trigger; policies only.
5. **Aggregation page.** `/dashboard/projects/[id]` gathers the project's files, decision records,
   and learning moments in one view — the rounded per-project picture the feature exists to produce.

### Consequences

* Good, because project grouping has its own entity and cannot corrupt or overload `target_roles`
  or `decision_records`; each table keeps a single responsibility.
* Good, because narrative lives in exactly one place (decision records); the file page is an on-ramp
  to that store, not a parallel one, so there is nothing to drift.
* Good, because assignment is optional and project deletion is non-destructive (`set null`), so the
  feature can never lose a user's evidence.
* Good, because ownership is enforced the same way the codebase already hardened `evidence_links`,
  so there is no new security pattern to learn or get wrong.
* Good, because it adds no LLM call, no FSM, and no second service — the dormant R1/R2-distributed/R3
  runtime rules stay dormant, and only SOLID + RLS boundaries (already in force) apply.
* Bad, because three tables now carry a `project_id` and three INSERT/UPDATE policies must be kept in
  lockstep; a future evidence table must remember to add the column, the index, and the guard.
* Bad, because a per-table column (not a polymorphic join) means a one-to-many "a record in many
  projects" relationship is not expressible without a later schema change — accepted, since a piece
  of evidence belonging to exactly one project matches the user's mental model today.
* Neutral, because the file page gains a `caption` column; a file still carries minimal metadata and
  its substance continues to live in linked decision records.

Rejected: **B** (overloads an entity whose meaning is "a job I am targeting", conflating aspiration
with history); **C / Fork A** (duplicates decision-record narrative onto files — two drifting
sources of truth, the trap this ADR exists to avoid); **D** (a polymorphic join table is more
machinery than one-project-per-item needs, and polymorphic FKs cannot be enforced by a single
database foreign key — more surface for less benefit, deferrable to an ADR if many-to-many is ever
required).

## More Information

Follows the cross-table ownership pattern established by
`supabase/migrations/20261112000019_harden_evidence_links_file_ownership.sql`. Reuses
`decision_records` and `evidence_links` unchanged (the file hub links through `evidence_links`), and
depends on the `learning_moments` table from migration
`20261119050000_add_learning_moments.sql` (present on `main`; the feature branch must be cut from
`main`). No runtime guardrail (R1/R3) is engaged — this is plain RLS-scoped CRUD, governed by the
SOLID / module-boundary rows of the [applicability matrix](../../.claude/rules/README.md) that are
already in force. Design notes: [`docs/design/projects-and-file-detail.md`](../design/projects-and-file-detail.md).
