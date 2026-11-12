# Security review: Upload files (non-AI slice)

Date: 2026-11-12
Mode: Task
Scope: src/lib/files/{validation,mappers,record,repository,queries,actions}.ts; src/app/dashboard/files/{page.tsx,FilesManager.tsx}; src/components/Sidebar.tsx; vitest.config.ts; supabase/migrations/20261112110000_set_user_files_bucket_limits.sql. (Relies on the existing `files` table RLS and `user-files` storage policies from E3; the new migration hardens the bucket's limits.)
Tools: npm audit (prod + full), manual review

## Summary
| Severity | Open | Fixed | Accepted |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 2 | 1 | 0 |

No Critical or High findings: the release gate is not blocked. F1 is fixed by the new
bucket-limits migration; the remaining Low findings are cosmetic/self-only (F2) and
pre-existing tooling (F3).

## Findings

### F1: Upload limits enforced only in the app, not on the bucket
- Severity: Low
- Status: Fixed — `supabase/migrations/20261112110000_set_user_files_bucket_limits.sql` sets `file_size_limit` and `allowed_mime_types` on the `user-files` bucket, so Storage itself now rejects oversized/other-typed objects even on a direct API upload. (The cap was subsequently raised from 10&nbsp;MB to 25&nbsp;MB in `20261112120000_raise_user_files_size_limit.sql` to fit complex evidence documents, still well within Supabase's standard-upload ceiling.) Takes effect on hosted once the migrations are pushed (`supabase db push`, dry-run first).
- Location: `supabase/migrations/20261107202128_create_storage_bucket.sql` (bucket created without `file_size_limit` / `allowed_mime_types`); app-layer gate in `src/lib/files/validation.ts` + re-check in `src/lib/files/record.ts`.
- Risk: The size cap and the mime allow-list live in our code. The browser uploads bytes straight to Storage, and a determined signed-in user could call the Storage API directly (bypassing our UI) to put an oversized or other-typed object **in their own folder**. Row-Level Security still stops them touching anyone else's files, so the blast radius is their own storage quota and project storage cost — not other users' data.
- How an attacker could use it: An authenticated user scripts large uploads to their own `user-files/<their-id>/` folder, running up the project's storage bill. They cannot reach another user's folder (storage RLS checks `foldername[1] = auth.uid()`).
- Analogy: We check bag size at the check-in desk, but the loading door onto the plane has no size gauge of its own — a passenger who walks straight to the door can load an oversized bag into their own locker.
- Fix (proposed): a small migration that sets `file_size_limit` (10&nbsp;MB) and `allowed_mime_types` on the `user-files` bucket, so the cap and type list are enforced by Storage itself regardless of client. This makes the bucket the authoritative gate and the app validation the fast-feedback layer. Asking before adding it, since the approved design said no migration.

### F2: File metadata is recorded from client-reported values
- Severity: Low
- Status: Open (mitigated; fully resolved by F1's fix)
- Location: `src/lib/files/record.ts` / `actions.ts` — `fileName`, `mimeType`, `sizeBytes` are reported by the browser and stored without the server reading the object's bytes.
- Risk: A signed-in user could record a row whose `size_bytes`/`mime_type` don't match the real object in their own folder (e.g. claim a 9&nbsp;MB file is 5&nbsp;KB). Impact is cosmetic and self-only: it affects what *their own* file list shows them. It is partly mitigated already — the server re-validates that the mime is in the allow-list, the size is within the cap, and the storage key is in the user's own folder (`record.ts`), so a row can never *look* disallowed.
- How an attacker could use it: Only to mislabel their own files to themselves. No cross-user or integrity impact.
- Analogy: Writing your own luggage tag — you can put the wrong weight on your own bag, but it's your bag.
- Fix: F1's bucket `allowed_mime_types` + `file_size_limit` make the stored object itself conform; reading object metadata server-side would also close the cosmetic gap but isn't worth the extra round trip for this slice.

### F3: Dev-only dependency vulnerabilities (npm audit)
- Severity: Low
- Status: Open (pre-existing; not introduced by this slice — no dependencies were added)
- Location: devDependencies (vitest → tinypool, test-exclude → glob/minimatch) — all dev-only.
- Risk: Test tooling, not part of the production bundle. `npm audit --omit=dev --audit-level=low` reports **0 vulnerabilities**, which is exactly what CI gates on (`.github/workflows/ci.yml`).
- How an attacker could use it: Not reachable from the deployed app or user input.
- Analogy: A faulty tool in the workshop, not a part bolted into the shipped car.
- Fix: No production action; track the vitest major upgrade as routine tooling maintenance (unchanged from prior reviews).

## Observations (outside this task - not changed)
- **Per-user isolation** rests on the existing E3 controls: `files` table RLS (own-rows select/insert/update/delete) and the four `user-files` storage policies that scope every object operation to `foldername[1] = auth.uid()`. The upload path is `${userId}/${uuid}-${safeName}` and the server re-checks the `${userId}/` prefix (`record.ts`), so a tampered client cannot write to or reference another user's folder.
- **Path traversal**: `sanitizeFileName` drops any directory part (`../`, `C:\…`) and control characters before the name reaches the storage key; storage RLS is the backstop. Covered by unit tests.
- **Delete is IDOR-safe**: `deleteFileAction` looks up the row by id under RLS; a non-owner's id returns no row and the call is a no-op. The storage object removed is the row's own `storage_path` (from the DB, not the client).
- **No execution/serving path yet**: files go to a private bucket and are not downloaded, previewed, or served in this slice, so stored content cannot be executed or rendered. When a download/preview feature lands, serve with `Content-Disposition: attachment` and never render uploaded HTML inline (stored-XSS prevention). Flagged there, not here.
- **XSS**: file names are rendered through React (auto-escaped), including in status messages; no `dangerouslySetInnerHTML`.
- **CSRF / auth**: Next.js Server Actions carry built-in same-origin protection; both actions call `auth.getUser()` and redirect to `/login` when signed out.
- **Secrets**: no secrets in new code; the browser client uses the public publishable key (safe — RLS enforced) and the server client uses the cookie session. No service-role key is used.
- Project-wide (unchanged): no logging framework; Supabase calls set no explicit timeout.
