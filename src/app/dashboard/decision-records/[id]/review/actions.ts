"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  defaultDeps,
  startReview,
  acceptReview,
} from "@/lib/reviewer/orchestrator";
import type { ReviewFlag, ReviewStatus } from "@/lib/reviewer/types";

/**
 * Thin Server Actions for the Reviewer Agent Check. Each re-checks auth (defence in depth), builds
 * the RLS-scoped orchestrator dependencies for the signed-in user, and delegates to the tested
 * orchestrator. No business logic lives here — the FSM + orchestrator own the decisions, and the
 * HITL gate (flags persisted and the record marked reviewed only on accept) is enforced there
 * (ADR-0016). The proposed flags are RETURNED to the client (never written) until the user accepts.
 */
async function userIdOrRedirect(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

export type RunReviewResult = { status: ReviewStatus; flags: ReviewFlag[] };

/** Run the full review pass and return the proposed flags (nothing is persisted here). */
export async function runReviewAction(
  recordId: string
): Promise<RunReviewResult> {
  const userId = await userIdOrRedirect();
  const deps = await defaultDeps(userId);
  const { state } = await startReview(deps, { userId, recordId });
  const flags = "flags" in state ? state.flags : [];
  return { status: state.status, flags };
}

/** Persist the user's accepted/dismissed flags and mark the record reviewed (the HITL side effect). */
export async function acceptReviewAction(
  recordId: string,
  flags: ReviewFlag[]
): Promise<{ status: ReviewStatus }> {
  const userId = await userIdOrRedirect();
  const deps = await defaultDeps(userId);
  const { state } = await acceptReview(deps, { userId, recordId, flags });
  revalidatePath(`/dashboard/decision-records/${recordId}/review`);
  revalidatePath("/dashboard");
  return { status: state.status };
}
