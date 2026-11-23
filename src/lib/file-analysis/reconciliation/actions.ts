"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { reconcileFile, saveReconciliationDecisions } from "./orchestrator";
import { reconciliationFlagSchema } from "./types";
import type { ReconciliationFlag } from "./types";

/**
 * Server Actions for cross-document reconciliation (MVP 2 Phase 2, ADR-0023). Split so the HITL
 * property holds across the network boundary: `reconcileFileAction` only compares and proposes
 * flags (never writes), and `saveReconciliationFlagsAction` is the separate, explicit save that
 * persists the user's accept/dismiss decisions. Each re-checks auth and validates with Zod.
 */

export type ReconcileResult =
  | { ok: true; flags: ReconciliationFlag[]; dropped: number }
  | { ok: false; error: string };

/** Run one reconciliation pass for a file; proposes conflict/complementary flags, never saves. */
export async function reconcileFileAction(
  fileId: string
): Promise<ReconcileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    const { flags, dropped } = await reconcileFile(fileId);
    return { ok: true, flags, dropped };
  } catch (err) {
    console.error("reconciliation failed", err);
    return {
      ok: false,
      error:
        "Couldn't check this file against your evidence. Please try again.",
    };
  }
}

export type SaveReconciliationResult =
  { ok: true; saved: number } | { ok: false; error: string };

const saveInputSchema = z.object({
  fileId: z.string().min(1),
  flags: z.array(reconciliationFlagSchema),
});

/** The explicit save: persist the flags the user accepted/dismissed. Nothing else writes. */
export async function saveReconciliationFlagsAction(input: {
  fileId: string;
  flags: ReconciliationFlag[];
}): Promise<SaveReconciliationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid reconciliation flags to save." };
  }

  try {
    const { savedIds } = await saveReconciliationDecisions(parsed.data);
    revalidatePath("/dashboard/files");
    return { ok: true, saved: savedIds.length };
  } catch (err) {
    console.error("saving reconciliation flags failed", err);
    return {
      ok: false,
      error: "Couldn't save your reconciliation decisions. Please try again.",
    };
  }
}
