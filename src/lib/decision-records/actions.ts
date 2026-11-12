"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveDecisionRecord } from "./save";
import { createSupabaseDecisionRecordRepository } from "./repository";

/**
 * Result shape returned to the form via `useActionState`.
 * `error` shows a problem (e.g. a missing required field, AC6); `notice` confirms
 * a successful save.
 */
export type DecisionRecordState = {
  error?: string;
  notice?: string;
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Thin Server Action: reads the form, resolves the signed-in user, and delegates
 * to the tested `saveDecisionRecord` orchestration. No business logic lives here.
 *
 * This runs only when the user submits the explicit "Confirm & save" step in the
 * form (AC3): fields are entered and reviewed first, and nothing is written until
 * this action fires.
 */
export async function saveDecisionRecordAction(
  _prevState: DecisionRecordState | undefined,
  formData: FormData
): Promise<DecisionRecordState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const input = {
    title: field(formData, "title"),
    situation: field(formData, "situation"),
    cue: field(formData, "cue"),
    decision: field(formData, "decision"),
    why: field(formData, "why"),
    outcome: field(formData, "outcome"),
    source: field(formData, "source"),
  };

  const fileId = field(formData, "file_id") || null;
  const recordId = field(formData, "record_id") || null;

  const repo = createSupabaseDecisionRecordRepository(supabase);

  let result;
  try {
    result = await saveDecisionRecord(repo, {
      userId: user.id,
      input,
      fileId,
      recordId,
    });
  } catch {
    return { error: "Could not save your record. Please try again." };
  }

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/dashboard");
  return { notice: "Saved." };
}
