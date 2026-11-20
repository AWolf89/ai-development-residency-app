/**
 * Pure, dependency-free validation for file uploads.
 *
 * Humble Object: no network, no framework, no Supabase — just plain inputs and a
 * result object, so every branch is unit-testable with canned values. This is the
 * upload gate: the browser calls it before uploading (fast feedback) and the
 * Server Action calls it again on the reported metadata (defence in depth), so the
 * client check is never the only line of defence.
 */

/** Largest file we accept, in bytes (25 MB). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** A file name longer than this is rejected (keeps storage keys sane). */
export const MAX_FILE_NAME_LENGTH = 200;

/** A file's one-line caption ("what this deliverable is") cap. */
export const FILE_CAPTION_MAX = 280;

export type CaptionValidationResult =
  { ok: true; value: string | null } | { ok: false; error: string };

/**
 * Validate a file's optional caption. Trims it; an empty or absent caption
 * normalises to null (clearing the field), and anything over the cap is
 * rejected. Pure, so the Server Action and the client can share the gate.
 */
export function validateFileCaption(input: unknown): CaptionValidationResult {
  if (input === null || input === undefined) {
    return { ok: true, value: null };
  }
  if (typeof input !== "string") {
    return { ok: false, error: "That caption isn't valid." };
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }
  if (trimmed.length > FILE_CAPTION_MAX) {
    return {
      ok: false,
      error: `Caption is too long (max ${FILE_CAPTION_MAX} characters).`,
    };
  }
  return { ok: true, value: trimmed };
}

/**
 * Evidence files we accept. Kept deliberately small: documents and images a user
 * would cite as evidence. Not an arbitrary file host.
 */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
  "text/markdown",
  "text/csv",
  // .docx
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // .pptx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // .ppt (legacy)
  "application/vnd.ms-powerpoint",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Map a known file extension to its mime type, used only as a fallback. */
const EXTENSION_MIME: Record<string, AllowedMimeType> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
};

/**
 * Best mime type for a picked file. Browsers often report an empty `File.type`
 * for text files (e.g. `.md`, `.txt`) on some platforms, so fall back to the
 * extension. Returns "" when neither is known, which `validateFileUpload` then
 * rejects.
 */
export function inferMimeType(fileName: string, reportedType: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  // A `.csv` is authoritative by extension: Windows browsers with Excel
  // installed report CSVs as `application/vnd.ms-excel` or `application/csv`,
  // which would otherwise be rejected. A real `.xls` keeps its own type and is
  // still not accepted.
  if (ext === "csv") {
    return "text/csv";
  }

  if (typeof reportedType === "string" && reportedType.trim().length > 0) {
    return reportedType;
  }
  return EXTENSION_MIME[ext] ?? "";
}

export type FileUploadInput = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type FileValidationResult =
  { ok: true; value: FileUploadInput } | { ok: false; error: string };

/**
 * Clean a file name for safe use in a storage key: drop any directory part
 * (so "../" or "C:\..." can't escape the user's folder), strip control
 * characters, collapse whitespace, and replace anything outside a safe set with
 * an underscore. Never returns an empty string.
 */
export function sanitizeFileName(name: string): string {
  // Keep only the final path segment — defeat "../evil" and "C:\\x\\evil".
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "") // control chars
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^a-zA-Z0-9 ._-]/g, "_");

  return cleaned.length > 0 ? cleaned : "file";
}

/**
 * Build the per-user storage key. The first path segment MUST be the user id:
 * the `user-files` bucket's RLS policy checks `foldername[1] = auth.uid()`, so a
 * key that doesn't start with the user's id would be rejected by storage. A uuid
 * prefix keeps re-uploads of the same name from colliding. The uuid is passed in
 * (not generated here) so this function stays pure and testable.
 */
export function buildStoragePath(
  userId: string,
  fileName: string,
  uuid: string
): string {
  return `${userId}/${uuid}-${sanitizeFileName(fileName)}`;
}

function isAllowedMime(value: string): value is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Validate the metadata of a file the user wants to upload. Returns the cleaned
 * value (trimmed name) or a single human-readable error. Does not read bytes.
 */
export function validateFileUpload(input: unknown): FileValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Choose a file to upload." };
  }
  const obj = input as Record<string, unknown>;

  const fileName = typeof obj.fileName === "string" ? obj.fileName.trim() : "";
  if (fileName.length === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }
  if (fileName.length > MAX_FILE_NAME_LENGTH) {
    return {
      ok: false,
      error: `File name is too long (max ${MAX_FILE_NAME_LENGTH} characters).`,
    };
  }

  const mimeType = typeof obj.mimeType === "string" ? obj.mimeType : "";
  if (!isAllowedMime(mimeType)) {
    return {
      ok: false,
      error:
        "That file type isn't supported. Upload a PDF, image, or document.",
    };
  }

  const sizeBytes = typeof obj.sizeBytes === "number" ? obj.sizeBytes : NaN;
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: "That file looks empty." };
  }
  if (sizeBytes > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `File is too large (max ${MAX_FILE_BYTES / (1024 * 1024)} MB).`,
    };
  }

  return { ok: true, value: { fileName, mimeType, sizeBytes } };
}
