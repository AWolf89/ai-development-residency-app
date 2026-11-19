import "server-only";
import { indexEvidenceForCurrentUser } from "@/lib/rag/evidence-index";
import {
  decisionRecordToEvidenceText,
  type DecisionRecordFields,
} from "./evidence-text";

/**
 * Index one saved decision record as per-user evidence (so the Gap Check can retrieve
 * it). Thin boundary: assembles the record's text (pure) and delegates to the existing
 * per-user indexer. Callers run it best-effort, so a failure never breaks the save.
 */
export async function indexDecisionRecordEvidence(params: {
  recordId: string;
  fields: DecisionRecordFields;
}): Promise<void> {
  const text = decisionRecordToEvidenceText(params.fields);
  await indexEvidenceForCurrentUser(text, {
    source_kind: "decision_record",
    decision_record_id: params.recordId,
    title: params.fields.title,
  });
}
