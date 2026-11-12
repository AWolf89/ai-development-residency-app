"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveTargetRole } from "./save";
import { createSupabaseTargetRoleRepository } from "./repository";

/**
 * Result shape returned to the form via `useActionState`.
 * `error` shows a problem (e.g. AC9); `notice` confirms a successful save.
 */
export type TargetRoleState = {
  error?: string;
  notice?: string;
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Thin Server Action: reads the form, resolves the signed-in user, and delegates
 * to the tested `saveTargetRole` orchestration. Runs only on the explicit
 * "Confirm & save" step (AC3); no business logic lives here.
 */
export async function saveTargetRoleAction(
  _prevState: TargetRoleState | undefined,
  formData: FormData
): Promise<TargetRoleState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const requirements = formData
    .getAll("requirements")
    .filter((v): v is string => typeof v === "string");

  const input = {
    title: field(formData, "title"),
    jobDescription: field(formData, "job_description"),
    requirements,
  };
  const recordId = field(formData, "record_id") || null;

  const repo = createSupabaseTargetRoleRepository(supabase);

  let result;
  try {
    result = await saveTargetRole(repo, {
      userId: user.id,
      input,
      recordId,
    });
  } catch {
    return { error: "Could not save your target role. Please try again." };
  }

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/dashboard");
  return { notice: "Saved." };
}
