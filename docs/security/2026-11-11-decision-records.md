# Security review: Decision Records & Profile Save (non-AI slice)

Date: 2026-11-11
Mode: Task
Scope: src/lib/decision-records/{validation,mappers,save,repository,actions,queries}.ts; src/app/dashboard/decision-records/{DecisionRecordForm.tsx,new/page.tsx,[id]/page.tsx}; src/app/dashboard/page.tsx; supabase/migrations/20261111231333_add_decision_record_detail_columns.sql
Tools: npm audit (prod + full), manual review

## Summary
| Severity | Open | Fixed | Accepted |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 1 | 1 | 0 |

No Critical or High findings: the release gate is not blocked.

## Findings

### F1: Evidence link does not verify the linked file belongs to the user
- Severity: Low
- Status: Fixed
- Location: src/lib/decision-records/repository.ts (insertEvidenceLink) / actions.ts (file_id from the form)
- Risk: The file picker only lists the user's own files, but `file_id` is a client-controlled hidden form field. A crafted submission could put another user's file UUID into an `evidence_links` row under the attacker's own record.
- How an attacker could use it: Submit the save form with a guessed/known file UUID that isn't theirs. The link row would reference that file. Confidentiality is still protected — the `files` and `file_text` tables have their own RLS, so the attacker cannot read the file's contents or metadata through the link — so the practical impact is a meaningless dangling reference in the attacker's own data, plus a weak existence oracle for a UUID.
- Analogy: Writing someone else's locker number on your own notepad. You can note the number, but you still can't open their locker.
- Fix: Applied in migration 20261112000019_harden_evidence_links_file_ownership.sql — the `evidence_links` INSERT and UPDATE policies now require the referenced `file_id` (when not null) to belong to the same user (a WITH CHECK that the file's owner = auth.uid()). Legitimate users (who pick from their own files) are unaffected. Pushed to hosted. (A duplicate-link bug on edit was also fixed in the same slice: the save path now replaces/clears the link idempotently via setEvidenceLink.)

### F2: Dev-only dependency vulnerabilities (npm audit)
- Severity: Low
- Status: Open
- Location: devDependencies (vitest → tinypool [critical], @typescript-eslint/*, test-exclude, glob, minimatch) — 14 advisories (12 moderate, 2 critical), all dev-only
- Risk: These packages are test/lint tooling and are not part of the production bundle. `npm audit --omit=dev` reports 0 vulnerabilities, which is what CI gates on.
- How an attacker could use it: The tinypool RCE requires passing malicious worker options into the test runner — it is not reachable from the deployed app or from user input. No production exposure.
- Analogy: A faulty tool in the workshop, not a part bolted into the car that ships.
- Fix: No production action required. Upgrading would mean `vitest@5` (a breaking major) — track it as routine tooling maintenance, separate from this ticket.

## Observations (outside this task - not changed)
- `updateRecord` (repository.ts) does not check the number of affected rows. On edit, RLS already prevents modifying another user's record (the UPDATE matches 0 rows), so there is no data-integrity risk; the only effect is that a forged `record_id` would show "Saved" while changing nothing. Cosmetic; could return a not-found error for clarity later.
- No logging framework exists project-wide, so unexpected server-action errors are shown to the user as a friendly message but not recorded for operators. Project-wide concern (also noted in self-review).
