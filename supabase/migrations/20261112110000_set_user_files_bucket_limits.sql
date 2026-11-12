-- Harden the user-files bucket: enforce the size cap and type allow-list at the
-- storage layer, not just in the app. This makes the limits authoritative even
-- for a client that uploads straight to the Storage API, bypassing our UI
-- (security review 2026-11-12-upload-files, finding F1). The app-layer validation
-- in src/lib/files/validation.ts stays as fast user feedback; these are the gate.
--
-- Kept in step with the app:
--   file_size_limit  = 10 MB   (MAX_FILE_BYTES = 10 * 1024 * 1024 = 10485760)
--   allowed_mime_types         = ALLOWED_MIME_TYPES

update storage.buckets
set
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
where id = 'user-files';
