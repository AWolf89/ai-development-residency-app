# Security review: Target Role by Title (title-first path)

Date: 2026-11-12
Mode: Task
Scope: src/lib/target-roles/{occupation,validation,save,mappers,repository,actions}.ts; src/app/dashboard/target-roles/TargetRoleForm.tsx; supabase/migrations/20261112130000_add_target_role_source_occupation.sql; vitest.config.ts
Tools: npm audit (prod + full), manual review

## Summary
| Severity | Open | Fixed | Accepted |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 2 | 0 | 0 |

No Critical or High findings: the release gate is not blocked.

## Findings

### F1: Client-supplied provenance text stored without validation
- Severity: Low
- Status: Open (accepted-by-design; self-only)
- Location: `src/lib/target-roles/actions.ts` (`saveTargetRoleAction` title branch) → `source_occupation_title` / `source_occupation_code` from form fields, stored on the user's own `target_roles` row.
- Risk: A user could submit arbitrary text for the source-occupation fields. It is stored only on their own row (RLS) and rendered only back to them, escaped by React. No cross-user or integrity impact.
- How an attacker could use it: Only to mislabel their own role's provenance to themselves.
- Analogy: Writing your own sticky note on your own file.
- Fix: None needed for this slice. If provenance is ever shown to other users or exported, resolve the code against `reference_items` server-side instead of trusting the posted value.

### F2: Dev-only dependency vulnerabilities (npm audit)
- Severity: Low
- Status: Open (pre-existing; no dependencies added here)
- Location: devDependencies (vitest → tinypool, test-exclude). `npm audit --omit=dev --audit-level=low` reports 0 — exactly what CI gates on.
- Risk: Test tooling only, not in the production bundle.
- Fix: Routine vitest-major upgrade; no production action.

## Observations (outside this task - not changed)
- **Injection**: the occupation prefix and SOC code are stripped of LIKE metacharacters (`% _ \`) and passed as bound parameters by supabase-js; `payload->>scale_id = 'IM'` is a fixed literal. No SQL/ILIKE-wildcard risk.
- **Access control**: `suggestOccupationsAction` returns `[]` and `deriveOccupationRequirementsAction` redirects when signed out; both read `reference_items`, which is read-only to all authenticated users by policy. Saves go through the existing RLS-scoped `saveTargetRole`.
- **Read-only reference data unchanged**: no write policy was added to `reference_items`.
- **Migration**: additive, nullable columns on `target_roles`; existing rows stay valid; RLS unchanged.
- **XSS**: occupation titles and requirement text render through React (auto-escaped); no `dangerouslySetInnerHTML`.
- Project-wide (unchanged): no logging framework; Supabase calls set no explicit timeout.
