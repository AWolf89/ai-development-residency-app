/**
 * Pure status derivation for a claim (ADR-0015). The status is computed on read from real
 * signals — never stored — so it can never disagree with the evidence actually linked.
 * Evidence present always wins over the metric flag.
 */
import type { ClaimStatus } from "./types";

/**
 * Derive a claim's status:
 *  - any linked evidence file ⇒ `evidence_linked`
 *  - otherwise, a user-marked metric ⇒ `self_reported_metric`
 *  - otherwise ⇒ `recollection`
 */
export function deriveStatus(input: {
  sourceCount: number;
  isMetric: boolean;
}): ClaimStatus {
  if (input.sourceCount > 0) {
    return "evidence_linked";
  }
  if (input.isMetric) {
    return "self_reported_metric";
  }
  return "recollection";
}
