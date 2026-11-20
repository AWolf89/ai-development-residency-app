# Security review: Learning Moment Capture

Date: 2026-11-19
Mode: Task
Scope: The Learning Moment Capture change (ADR-0018) — new `learning_moments` table + RLS,
the polymorphic `evidence_links` change, `src/lib/learning-moments/*`, the capture Server
Action and UI, and the nav entry. Reviewed against OWASP Top 10 (access control, injection,
XSS, sensitive-data exposure) and the app's own-rows RLS + "user text is data" rules.
Tools: npm audit (0 vulnerabilities; no new dependencies added), manual review.

## Summary
| Severity | Open | Fixed | Accepted |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 0 | 0 | 0 |

## Findings

None. The areas most at risk for this change were reviewed and found sound:

- **Broken access control / IDOR (A01).** `learning_moments` has own-rows RLS
  (select/insert/update/delete scoped to `auth.uid()`). The Server Action resolves the user
  from `auth.getUser()` and never trusts a `user_id` from the form — proven by a unit test
  that injects a hostile `user_id`/`userId` into the input and asserts the saved row and link
  still carry the caller's id. The polymorphic `evidence_links` INSERT/UPDATE policies verify
  that a linked **file** and a linked **learning moment** both belong to the caller (the same
  defence-in-depth as the 2026-11-12 file-ownership harden), and `learning_moments`' own
  policies verify a linked **target role** belongs to the caller. A client-supplied id for a
  resource the user does not own is rejected at the database.
- **Data integrity of the shared table.** Making `evidence_links.decision_record_id` nullable
  is guarded by a CHECK that exactly one parent is set (`num_nonnulls(decision_record_id,
  learning_moment_id) = 1`); existing rows (all with a decision record) satisfy it unchanged,
  and the existing file-ownership check is preserved verbatim.
- **Injection (A03).** All DB access goes through supabase-js (parameterised); there is no
  raw SQL in application code. The `kind` field is constrained to four values by a Zod enum
  and a DB CHECK.
- **XSS / user text as data.** User-entered `context` / `shift` / `result` are stored as data
  and only ever rendered through MUI/React (auto-escaped); no `dangerouslySetInnerHTML`.
- **Sensitive data (ADR-0007).** Career data stays private under RLS; the Server Action's
  error path logs no user content.
- **CSRF.** Mutations are Next.js Server Actions (same-origin protected).

## Observations (outside this task - not changed)
None.
