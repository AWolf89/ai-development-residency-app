/**
 * Pure mapping from a `files` row to the view model the UI renders, plus a
 * human-readable byte formatter. Kept separate from the Server Component
 * (Humble Object) so the formatting is unit-testable with no network. Date
 * formatting stays in the component (locale-aware, like the sibling features),
 * so `createdAt` is passed through unchanged.
 */

export type FileRow = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  storage_path: string;
};

export type FileView = {
  id: string;
  name: string;
  sizeLabel: string;
  createdAt: string;
  storagePath: string;
};

/** Format a byte count as B / KB / MB. Null or unknown sizes render as "—". */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function mapFileRowToView(row: FileRow): FileView {
  return {
    id: row.id,
    name: row.file_name,
    sizeLabel: formatBytes(row.size_bytes),
    createdAt: row.created_at,
    storagePath: row.storage_path,
  };
}
