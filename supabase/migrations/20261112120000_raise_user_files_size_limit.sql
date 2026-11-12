-- Raise the user-files bucket size limit from 10 MB to 25 MB.
-- The initial 10 MB cap was too small for complex evidence (scanned or
-- image-heavy PDFs, Word documents with embedded images, photos of documents).
-- Uploads go straight from the browser to Storage, so Vercel's request-body cap
-- does not apply; 25 MB stays well within Supabase's standard-upload ceiling.
--
-- Kept in step with the app: MAX_FILE_BYTES = 25 * 1024 * 1024 = 26214400.
-- allowed_mime_types is left unchanged from the prior migration.

update storage.buckets
set file_size_limit = 26214400
where id = 'user-files';
