# Security review: Target Role & Job Description Intake (non-AI slice)

Date: 2026-11-11
Mode: Task
Scope: src/lib/target-roles/{validation,extract,matching,source,mappers,save,repository,queries,actions}.ts; src/app/dashboard/target-roles/*; src/app/dashboard/page.tsx; supabase/migrations/20261112020119_add_role_requirement_source_and_reference_search.sql
Tools: npm audit (prod + full), manual review

## Summary
| Severity | Open | Fixed | Accepted |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 1 | 0 | 0 |

No Critical or High findings: the release gate is not blocked.

## Findings

### F1: Dev-only dependency vulnerabilities (npm audit)
- Severity: Low
- Status: Open
- Location: devDependencies (vitest → tinypool, @typescript-eslint/*, test-exclude) — all dev-only
- Risk: Test/lint tooling, not part of the production bundle. `npm audit --omit=dev` reports 0 vulnerabilities, which is what CI gates on.
- How an attacker could use it: Not reachable from the deployed app or user input.
- Analogy: A faulty tool in the workshop, not a part bolted into the shipped car.
- Fix: No production action required; track the vitest major upgrade as routine tooling maintenance (unchanged from the prior ticket's review).

## Observations (outside this task - not changed)
- Per-user isolation (AC11) relies on the existing RLS on target_roles and role_requirements (own-rows select/insert/update/delete); reference_items is read-only to authenticated users. `check_rls.py` passes. No new policies were needed.
- The O*NET fallback builds an ILIKE pattern from a requirement term. The term comes from `pickOnetSearchTerm`, which tokenizes to `[a-z0-9]` only, so it cannot carry ILIKE wildcards (`%`/`_`) or SQL; the value is also passed as a bound parameter by supabase-js. No injection risk.
- `reference_item_id` stored on a requirement is a server-resolved id from our own matching/search, not raw user input, and references the read-only reference table.
- Project-wide (unchanged): no logging framework; Supabase calls set no explicit timeout.
