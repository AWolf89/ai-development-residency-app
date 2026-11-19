"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  startInvestigation,
  acceptFinding,
  rejectFinding,
  defaultDeps,
  type InvestigationResult,
} from "./orchestrator";
import type { Finding, Requirement } from "./types";

/**
 * Thin Server Actions for the Evidence Investigation Agent (EIA 4). Each resolves the signed-in
 * user and delegates to the tested orchestrator with production deps; no business logic lives
 * here (Humble Object, CLAUDE.md §3). The Gap Check UI (EIA 6) calls these and renders the
 * returned finding for the user's accept / edit / reject decision.
 */

const GAP_CHECK_PATH = "/dashboard/gap-check";

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

/** Investigate one requirement to a proposed finding (no write). */
export async function startInvestigationAction(params: {
  requirement: Requirement;
  searchBudget?: number;
}): Promise<InvestigationResult> {
  const userId = await requireUserId();
  return startInvestigation(await defaultDeps(userId), {
    requirement: params.requirement,
    searchBudget: params.searchBudget,
  });
}

/** Accept the (possibly edited) finding: persist it as an investigated assessment. */
export async function acceptFindingAction(params: {
  requirement: Requirement;
  targetRoleId: string;
  finding: Finding;
}): Promise<InvestigationResult> {
  const userId = await requireUserId();
  const result = await acceptFinding(await defaultDeps(userId), {
    userId,
    requirement: params.requirement,
    targetRoleId: params.targetRoleId,
    finding: params.finding,
  });
  revalidatePath(GAP_CHECK_PATH);
  return result;
}

/** Reject the finding: leave the assessment unchanged. */
export async function rejectFindingAction(params: {
  requirement: Requirement;
  finding: Finding;
}): Promise<InvestigationResult> {
  await requireUserId();
  return rejectFinding({
    requirement: params.requirement,
    finding: params.finding,
  });
}
