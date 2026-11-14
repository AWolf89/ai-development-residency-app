# Security review: Title search over Framework roles

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
- Status: Open (pre-existing; no dependencies added)
- Location: devDependencies (vitest → tinypool, test-exclude). `npm audit --omit=dev --audit-level=low` reports 0 — what CI gates on.
- Fix: Routine vitest-major upgrade; no production action.

## Observations (outside this task - not changed)
- **No new data surface**: this change only *reads* `reference_items` (read-only to all authenticated users) — the Framework `job-functions` rows for search/derivation. No new table, column, write, or policy.
- **Injection**: the Framework search fetches the ~11 job-functions and filters name/alias **in memory** (no user value in the query); the slug used to fetch a role's skills is passed to `.eq("external_id", …)` as a bound parameter. The O*NET path is unchanged (metachar-stripped, parameterized).
- **Access control**: `suggestOccupationsAction` returns `[]` and `deriveRequirementsAction` redirects when signed out; saves still go through the RLS-scoped `saveTargetRole`. A Framework-derived requirement resolves to `framework` provenance via the existing `matchFramework`.
- **XSS**: suggestion names, aliases, and the source tag render through React (auto-escaped).
- Project-wide (unchanged): no logging framework; Supabase calls set no explicit timeout.
