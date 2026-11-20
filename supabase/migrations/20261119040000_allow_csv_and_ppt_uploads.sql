-- Widen the user-files bucket allow-list to match src/lib/files/validation.ts:
-- add CSV and PowerPoint (.pptx + legacy .ppt) alongside the existing types.
-- The bucket list is the authoritative gate (see 20261112110000); the app-layer
-- validation is fast feedback. The two must stay in step, so this mirrors
-- ALLOWED_MIME_TYPES exactly.

update storage.buckets
set
  allowed_mime_types = array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint'
  ]
where id = 'user-files';
