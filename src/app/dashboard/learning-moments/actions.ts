"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveLearningMoment } from "@/lib/learning-moments/save";
import { createSupabaseLearningMomentRepository } from "@/lib/learning-moments/repository";

/**
 * Result shape returned to the form via `useActionState`. `error` shows a problem (e.g. a
 * missing required field, AC4); `notice` confirms a successful save.
 */
export type LearningMomentState = {
  error?: string;
  notice?: string;
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Thin Server Action: reads the form, resolves the signed-in user, and delegates to the tested
 * `saveLearningMoment` orchestration. No business logic lives here. The user id comes from
 * `auth.getUser()` — never from the form — so a record can only ever be saved as its owner
 * (AC5; RLS enforces it at the database too).
 */
export async function saveLearningMomentAction(
  _prevState: LearningMomentState | undefined,
  formData: FormData
): Promise<LearningMomentState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const input = {
    kind: field(formData, "kind"),
    context: field(formData, "context"),
    shift: field(formData, "shift"),
    result: field(formData, "result"),
    duration: field(formData, "duration"),
    targetRoleId: field(formData, "target_role_id"),
  };

  const fileId = field(formData, "file_id") || null;
  const recordId = field(formData, "record_id") || null;
  const projectId = field(formData, "project_id") || null;

  const repo = createSupabaseLearningMomentRepository(supabase);

  let result;
  try {
    result = await saveLearningMoment(repo, {
      userId: user.id,
      input,
      fileId,
      recordId,
      projectId,
    });
  } catch {
    return { error: "Could not save your learning moment. Please try again." };
  }

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/dashboard");
  return { notice: "Saved." };
}
