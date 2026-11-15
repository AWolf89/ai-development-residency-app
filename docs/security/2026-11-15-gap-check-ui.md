# Security review: Gap Check UI (screen 04)

Date: 2026-11-15
Mode: Task
Scope: The new Gap Check screen and its data path — `src/app/dashboard/gap-check/`
(`page.tsx`, `actions.ts`, `RunGapCheckButton.tsx`), `src/lib/gap/presentation.ts`,
`src/lib/gap/queries.ts`, and the one-line `src/components/Sidebar.tsx` nav wiring.
Reuses the merged classifier (`src/lib/gap/classifier.ts`), the retrieval pipeline, and
the gateway unchanged; adds no migration and no runtime dependency.
Tools: npm audit (`--omit=dev` → 0), `tools/llm/check_llm_usage.py` (PASS, 224 files),
manual review against OWASP Top 10 (incl. LLM Applications 2025), focused on access
control, injection, and the new UI display boundary.

## Summary
| Severity | Open | Fixed | Accepted |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 0 | 0 | 0 |

No Critical or High findings — the release gate is not blocked by this change.

## Notes on controls verified (no finding)
- **Access control (A01).** The page guards `supabase.auth.getUser()` → redirect to
  `/login`. The `runGapCheck` Server Action is its own endpoint, so it re-checks auth **and**
  role ownership (`getTargetRoleById` returns null for a non-owner under RLS) before it
  classifies or saves — it does not trust the page that rendered the button. The read query
  (`getAssessmentsForRole`) and the classifier both run under the caller's session, so
  own-rows RLS (ADR-0011) scopes every read and write to the owner.
- **Parameter trust.** The `?role=` search param is validated against the user's own roles
  (`roles.find(...)`) and falls back to the newest role; a foreign or bogus id is ignored,
  never used to query another user's data.
- **XSS at the display boundary (A03).** Requirement text, the model rationale, and citation
  titles (user- and model-derived) are rendered only as React/MUI `Typography`/`Link`
  children, which escape by default. No `dangerouslySetInnerHTML`. The one next-step `href`
  is a hardcoded internal path (`/dashboard/files`), not derived from model output. This
  closes the forward-looking XSS note from the ADR-0011 review (the consuming UI).
- **SQL injection (A03).** No string-built SQL. The read uses the Supabase client's
  parameterised `.select().eq()`; persistence reuses the audited `.upsert()`.
- **Prompt injection (LLM01).** Unchanged. The action invokes the already-reviewed
  classifier, which `wrapUntrusted()`-wraps evidence/reference/requirement text and exposes
  the model no side-effecting tools (ADR-0011). No new injection surface is added.
- **Unbounded consumption / cost (LLM10).** Classification is on-demand (a deliberate
  button press, ADR-0012), never run on page load — the page only reads saved rows. This
  reduces, not enlarges, the token-spend surface; per-call bounds from ADR-0011 still apply.
- **Secrets (secrets-management).** None added. `classifier.ts` remains the only
  `server-only` key consumer; the page/action/query add no key handling and no
  `NEXT_PUBLIC_*`. `check_llm_usage.py` PASS.
- **Dependencies.** `npm audit --omit=dev` → 0 vulnerabilities; no runtime dependency added.

## Observations (outside this task — not changed)
- The per-requirement next-step links ("upload evidence or add it in an interview") point at
  the files page for now; the Interview flow does not exist yet (ADR-0012). Not a security
  concern — noted so the placeholder is not mistaken for a finding.
- Signed-in browser verification of the rendered screen was not possible in this environment
  (no local Supabase — Docker down — and hosted test sign-ins are rejected); verification
  rests on the build, 292 unit tests (pure mapping 100%), and the static checks above.
