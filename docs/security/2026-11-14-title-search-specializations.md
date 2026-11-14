# Security review: Title search over Framework specializations

Date: 2026-11-14
Mode: Task
Scope: src/lib/target-roles/{occupation,repository,actions}.ts; src/app/dashboard/target-roles/TargetRoleForm.tsx. No migration; no new writes.
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
- Pre-existing: yes — no dependencies added; `npm install` only completed the worktree's partial `node_modules`, with no `package.json`/lockfile change.
- Location: devDependencies (vitest → tinypool, test-exclude; eslint-config-next → typescript-eslint). `npm audit --omit=dev --audit-level=low` reports 0 — what CI gates on.
- Risk: These packages run only in the test runner and lint tooling, never in the shipped app, and never on end-user input.
- How an attacker could use it: They couldn't reach this code in production; the tinypool prototype-pollution-to-RCE gadget requires attacker-controlled worker options inside the test process.
- Analogy: A recall notice on a tool in the workshop, not on any part fitted to the car that leaves the lot.
- Fix: Routine vitest-major upgrade when convenient; no production action.

## Observations (outside this task - not changed)
- **No new data surface**: this change only *reads* `reference_items` (read-only to all authenticated users) — the Framework `specializations` rows for search and, for derivation, the related `job-functions` rows. No new table, column, write, or policy.
- **Injection**: the specialization search fetches the 23 specialization rows and filters name/alias **in memory** (no user value in the query at all). Derivation uses `.eq("external_id", slug)` (bound parameter, from the user's pick) and `.in("external_id", relatedSlugs)` where the slugs come from the *trusted vendored framework payload*, not user input. The job-function and O*NET paths are unchanged.
- **Access control**: `suggestOccupationsAction` returns `[]` and `deriveRequirementsAction` redirects when signed out; saves still go through the RLS-scoped `saveTargetRole`. A specialization-derived requirement resolves to `framework` provenance via the existing `matchFramework` (its task labels are framework activities).
- **DoS / fan-out**: bounded — the search reads 23 rows; derivation does at most two reads (the specialization plus its handful of related job-functions). The `MIN_OCCUPATION_PREFIX` guard still applies.
- **XSS**: specialization names, aliases, and the source tag render through React (auto-escaped).
- Project-wide (unchanged): no logging framework; Supabase calls set no explicit timeout.
