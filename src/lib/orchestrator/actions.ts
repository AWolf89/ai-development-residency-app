"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  startRun,
  advanceRun,
  completeStep,
  skipStep,
  resumeRun,
  getRun,
  defaultDeps,
  type OrchestrationRunResult,
} from "./orchestrator";

/**
 * Thin Server Actions for the orchestration layer (ADR-0026). Each resolves the signed-in user and
 * delegates to the tested orchestrator with production deps; no business logic lives here (Humble
 * Object, CLAUDE.md §3). A flow UI would call `startRunAction` on an uploaded file, `advanceRunAction`
 * to propose the current step, then the step's OWN agent action to save (its HITL gate), then
 * `completeStepAction` to advance. `resumeRunAction` recovers a failed step.
 */

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

/** Begin an orchestrated flow anchored to an uploaded file. */
export async function startRunAction(params: {
  fileId: string;
}): Promise<OrchestrationRunResult> {
  const userId = await requireUserId();
  return startRun(await defaultDeps(userId), { userId, fileId: params.fileId });
}

/** Run the current step's propose entry point and open its review gate. */
export async function advanceRunAction(params: {
  runId: string;
}): Promise<OrchestrationRunResult> {
  const userId = await requireUserId();
  return advanceRun(await defaultDeps(userId), { runId: params.runId, userId });
}

/** Record that the current step's own agent save (its HITL gate) succeeded, and advance. */
export async function completeStepAction(params: {
  runId: string;
}): Promise<OrchestrationRunResult> {
  const userId = await requireUserId();
  return completeStep(await defaultDeps(userId), {
    runId: params.runId,
    userId,
  });
}

/** Skip the current step and advance. */
export async function skipStepAction(params: {
  runId: string;
}): Promise<OrchestrationRunResult> {
  const userId = await requireUserId();
  return skipStep(await defaultDeps(userId), { runId: params.runId, userId });
}

/** Resume a failed run: re-open the failed step so it can be advanced again. */
export async function resumeRunAction(params: {
  runId: string;
}): Promise<OrchestrationRunResult> {
  const userId = await requireUserId();
  return resumeRun(await defaultDeps(userId), { runId: params.runId, userId });
}

/** Read the current position (and the Investigation Queue once complete). */
export async function getRunAction(params: {
  runId: string;
}): Promise<OrchestrationRunResult> {
  const userId = await requireUserId();
  return getRun(await defaultDeps(userId), { runId: params.runId, userId });
}
