/**
 * The persisted shape of an orchestration run (ADR-0026). One row per flow, anchored to the
 * uploaded file, storing ONLY workflow position (status + per-step ledger + cursor) — never agent
 * data, so nothing is duplicated. The pure state is rebuilt from this row by `rehydrate`
 * (orchestrator.ts), the same durable-rehydration pattern as interview sessions (ADR-0014).
 */
import type { OrchestrationStatus, StepKey, StepLedger } from "./types";

export type OrchestrationRunRow = {
  id: string;
  user_id: string;
  /** The uploaded file the flow is anchored to. */
  file_id: string;
  /** Set once the propose step creates/links a project; seeds the interview step. */
  project_id: string | null;
  /** Links the interview sub-FSM session so its completion drives the interview step. */
  interview_session_id: string | null;
  status: OrchestrationStatus;
  /** The per-step ledger (jsonb). */
  steps: StepLedger;
  cursor: StepKey | null;
  failure_step: StepKey | null;
  created_at: string;
  updated_at: string;
};
