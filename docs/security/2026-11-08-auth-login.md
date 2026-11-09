# Security review: Email/password authentication (feat/auth-login)

Date: 2026-11-08
Mode: Task
Scope: New auth feature — Supabase SSR clients, session middleware, sign-up/log-in/log-out server actions, credential validation, protected dashboard with per-user profile write, and homepage auth state.
Tools: npm audit, manual review

## Summary
| Severity | Open | Fixed | Accepted |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 1 | 0 | 0 |

## Findings

### F1: No app-level rate limiting on the auth forms
- Severity: Low
- Status: Open
- Location: src/lib/auth/actions.ts (login, signup)
- Risk: Repeated automated guesses at a password, or bulk creation of fake accounts.
- How an attacker could use it: A script could hammer the login action trying many passwords, or call signup thousands of times to create junk accounts.
- Analogy: A shop with no limit on how many free samples one person can grab.
- Fix: Mitigated at the platform level — Supabase Auth enforces its own rate limits on sign-in and sign-up endpoints by default, so this is defence-in-depth rather than an open hole. Adding app-level limiting (e.g. per-IP throttling) would need extra infrastructure and is deferred; revisit in the Week 5 security milestone.

## Observations (outside this task - not changed)
- `npm audit` reports 8 moderate advisories, all inside the `@typescript-eslint/*` chain pulled in by `eslint-config-next`. These are dev/lint-only dependencies — they are not shipped to users and do not run on user input — and they pre-date this change. No action taken here; worth a `npm audit` pass during the Week 5 PenTest milestone.

## Positive notes (verified secure patterns)
- Authoritative auth checks use `supabase.auth.getUser()` (revalidates with the auth server) on both the dashboard page and the profile-write action — not the spoofable cookie-only `getSession()`.
- Per-user data write is `.eq("id", user.id)` **and** backed by Row-Level Security, so a user cannot read or write another user's row even if the query were wrong (defence in depth).
- Mutations run as Next.js Server Actions, which carry built-in CSRF protection; no user-controlled redirect targets (open-redirect safe).
- Only the public `NEXT_PUBLIC_SUPABASE_URL` and publishable (anon) key are used; no service-role key in the codebase, and `.env.local` is gitignored.
- User-supplied values (email, display name) render through React (auto-escaped); no `dangerouslySetInnerHTML`.
