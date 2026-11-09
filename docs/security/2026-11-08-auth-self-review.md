## Self-review: Email/password authentication (feat/auth-login)

Checklist: Full

| Item | Status | Evidence |
|---|---|---|
| Correctness | PASS | `next build` + `tsc --noEmit` both green; all 5 routes generated; each flow (signup → session or email-confirm notice; login → /dashboard; logout → /login; dashboard guard; profile read/write) traced against the approved plan. Automated tests not yet written — that is the next step (test-planning). |
| Security basics | PASS | Full security review passed (docs/security/2026-11-08-auth-login.md), 1 Low, 0 Critical/High. No secrets in code (only NEXT_PUBLIC anon key via env; .env.local gitignored). Input validated in validation.ts; display name trimmed in profile/actions.ts. Queries use Supabase builder + RLS, no string-built SQL. |
| Error handling | PASS | Auth/profile actions return typed `AuthState`/`ProfileState` on failure and surface Supabase errors to the UI via MUI Alert; no silent swallow except the one documented, intentional no-op catch in supabase/server.ts (the standard Supabase pattern for Server Components). |
| Logging | N/A | The app has no logging infrastructure yet; auth errors surface to the user, and adding a logger is out of scope for this task. |
| Readability | PASS | Names describe intent; no dead or commented-out code (quick_scan 0 hits); comments explain why (e.g. the getUser-ordering note in middleware.ts). |
| Docs | FIXED | README.md: added an "Accounts" section (routes, guard, RLS, required env vars) and corrected the stale E1–E3 status table. ADR-0006 already records the auth-pattern decision, so no new ADR. |
| Scope | PASS | Only the approved pieces (Supabase clients, middleware, auth actions + pages, protected dashboard, homepage auth state) plus the two review docs and the in-scope README note. No unrelated refactors or renames. |
| Dependencies | PASS | No new packages: @supabase/ssr (0.12.7) and @supabase/supabase-js (2.119.0) were already in package.json; both pinned and actively maintained. |

### Failures explained
No FAILs. One note on **Correctness**: the pure validator in `validation.ts` is written to be unit-testable but no tests exist yet. The design-review flow's next step is the test-planning skill, which will add those — so this is a planned follow-up, not an open defect.

One note on **Logging**: marked N/A because there is no logging layer in the app. If you'd like, a later task can add structured logging for auth failures (useful for the Week 5 security milestone).

### Observations (outside this task - not changed)
- `npm audit` reports 8 moderate advisories in the `@typescript-eslint/*` dev/lint toolchain (via eslint-config-next). Dev-only, not shipped, pre-existing. Worth an `npm audit` pass during the Week 5 PenTest milestone.
