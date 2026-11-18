# Security review: Claims / Evidence Profile (ADR-0015)

Scope: the claims feature on `feat/claims-evidence-profile` — the `category` + `is_metric`
migration, the `src/lib/claims/*` module, the export route handler, the rebuilt
`/dashboard` profile, and the decision-record form additions. Reviewed because the change
touches **data storage** (new columns + CHECK), **input** (two new form fields), and a new
**auth-gated route** (CLAUDE.md §5).

## Summary

| Severity | Open | Fixed | Accepted |
| -------- | ---- | ----- | -------- |
| Critical | 0    | 0     | 0        |
| High     | 0    | 0     | 0        |
| Medium   | 0    | 0     | 0        |
| Low      | 1    | 0     | 1        |

No Critical or High findings: the release is not blocked.

## Findings

### F1: Dev-only dependency vulnerabilities (vitest / tinypool)

- Severity: Low
- Status: Open (pre-existing, not introduced here)
- Risk: `npm audit` reports advisories in the **test runner's** transitive packages;
  `npm audit --omit=dev` is clean, so nothing ships to users. Same finding tracked on the
  Reasoning Interview review; out of scope for this feature.

## Observations (verified, no change needed)

- **Authorization / IDOR.** Every read goes through `getClaims` under the RLS-scoped server
  client; `decision_records` and the embedded relations (`evidence_links`,
  `record_versions`, `record_requirement_links`, `interview_turns`) all carry own-rows RLS,
  so a user only ever sees their own claims. The export route and the profile page both
  re-resolve the user with `supabase.auth.getUser()` and 401 / redirect when absent.
- **Export route (`GET /dashboard/claims/export`).** Auth-gated; returns only the caller's
  own serialized claims; `format` is narrowed to `json | md`; a fixed filename; `Content-
  Disposition: attachment` and `Cache-Control: no-store` (personal data is not cached). The
  body is data produced by pure serializers — no user input is reflected into headers, so no
  header-injection or XSS vector. Nothing is sent to any third party (ADR-0007); no LLM call.
- **New columns.** `category` is guarded by a DB `CHECK` (four facets or NULL) *and* by Zod
  (`z.enum`) in the app; `is_metric` is a boolean defaulted false. The migration is additive
  and inherits `decision_records`' existing own-rows RLS — no new policy to review.
- **Mutations.** Setting `category` / `is_metric` is an absolute-overwrite update to the
  user's own record (naturally idempotent, CLAUDE.md rule 7); no count-like/money-like state,
  so no Request-ID/dedupe table is needed. The Server Action re-checks auth.
- **Output encoding.** Claim titles/decisions render as React text (auto-escaped); no
  `dangerouslySetInnerHTML`. Status is derived, never taken from user input.
- **Secrets.** None added; gitleaks pre-commit clean.

## Not browser-verified

Signed-in flows could not be exercised in-browser in this environment (no local Supabase;
hosted test sign-ins are rejected), the same limit noted on the sibling builds. Verification
was `tsc` type-check (clean), 394 unit tests + 12 claims boundary checks, coverage
(claims 100% / 98.6% branch; decision-records 100%), and eslint (0 errors). The production
`next build` type-check runs in CI (a fresh worktree lacks the generated route types locally).
