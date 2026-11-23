/**
 * The single writer for reconciliation flags (ADR-0023). Pure and DI-driven: it depends on a
 * `ReconciliationFlagRepository` interface, not on Supabase, so it is unit-tested with an injected
 * fake and no network. The Supabase-backed implementation lives in `repository.ts`.
 *
 * This is the ONLY place flags are written, and it is reached only from the explicit save action
 * after the user has accepted/dismissed each flag — nothing is persisted at ingest without the
 * user acting (HITL, ADR-0013). Commands throw on error; they do not return codes.
 */
import type { ReconciliationFlag, ReconciliationFlagRow } from "./types";

export interface ReconciliationFlagRepository {
  insertFlags(rows: ReconciliationFlagRow[]): Promise<{ ids: string[] }>;
}

export type PersistReconciliationParams = {
  userId: string;
  fileId: string;
  /** The flags the user decided on (accepted/dismissed); still-pending flags are not persisted. */
  flags: ReconciliationFlag[];
  modelUsed?: string | null;
  promptVersion?: string | null;
};

/** Map a decided flag to its DB row. */
function toRow(
  flag: ReconciliationFlag,
  params: PersistReconciliationParams
): ReconciliationFlagRow {
  return {
    user_id: params.userId,
    file_id: params.fileId,
    kind: flag.kind,
    message: flag.message,
    new_value: flag.newValue,
    existing_value: flag.existingValue,
    citations: flag.citations,
    disposition: flag.disposition,
    model_used: params.modelUsed ?? null,
    prompt_version: params.promptVersion ?? null,
  };
}

/**
 * Persist the reconciliation flags the user decided on. Only flags with a non-pending disposition
 * are written (a flag the user never looked at is not recorded). Returns the created ids.
 */
export async function persistReconciliationFlags(
  repo: ReconciliationFlagRepository,
  params: PersistReconciliationParams
): Promise<{ savedIds: string[] }> {
  const decided = params.flags.filter((f) => f.disposition !== "pending");
  if (decided.length === 0) {
    return { savedIds: [] };
  }
  const rows = decided.map((flag) => toRow(flag, params));
  const { ids } = await repo.insertFlags(rows);
  return { savedIds: ids };
}
