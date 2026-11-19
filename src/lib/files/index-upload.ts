/**
 * Orchestration that turns an uploaded file into searchable evidence: download the
 * bytes, extract their text, and hand it to the per-user evidence indexer.
 *
 * Humble Object / Dependency Inversion: the side-effecting pieces (storage download,
 * the real indexer) are injected, so this flow is unit-tested with fakes and has no
 * `server-only` import of its own. The Server Action wires the real deps. It imports
 * only types from the indexer (erased at runtime), so it stays a plain unit.
 */
import { extractText } from "./extract";
import type { EvidenceSource, IndexResult } from "@/lib/rag/evidence-index";

export type UploadIndexDeps = {
  /** Fetch the stored object's bytes (RLS-scoped to the owner). */
  download: (storagePath: string) => Promise<Uint8Array>;
  /** The real per-user indexer (resolves the signed-in user itself). */
  index: (text: string, source: EvidenceSource) => Promise<IndexResult>;
  /** Overridable in tests; defaults to the real MIME dispatcher. */
  extract?: (bytes: Uint8Array, mimeType: string) => Promise<string>;
};

export type UploadIndexParams = {
  fileId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
};

/**
 * Extract and index one uploaded file's text. Returns {indexed:0} for files with no
 * extractable text (e.g. images) — the indexer no-ops on empty text. Throws on a real
 * failure; the caller runs this best-effort so a failure never breaks the upload.
 */
export async function indexUploadedFileEvidence(
  params: UploadIndexParams,
  deps: UploadIndexDeps
): Promise<IndexResult> {
  const extract = deps.extract ?? extractText;
  const bytes = await deps.download(params.storagePath);
  const text = await extract(bytes, params.mimeType);
  return deps.index(text, {
    source_kind: "file",
    file_id: params.fileId,
    title: params.fileName,
  });
}
