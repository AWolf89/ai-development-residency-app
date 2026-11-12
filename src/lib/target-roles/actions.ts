"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveTargetRole } from "./save";
import {
  createSupabaseTargetRoleRepository,
  searchOccupations,
  getOccupationAttributes,
} from "./repository";
import {
  buildRequirementsFromOccupation,
  type OccupationSuggestion,
} from "./occupation";

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

  // The title path saves without requiring a job description and records which
  // O*NET occupation the requirements were derived from.
  const isTitlePath = field(formData, "mode") === "title";
  const occupationCode = field(formData, "source_occupation_code");
  const sourceOccupation =
    isTitlePath && occupationCode
      ? {
          title: field(formData, "source_occupation_title"),
          code: occupationCode,
        }
      : null;

  const repo = createSupabaseTargetRoleRepository(supabase);

  let result;
  try {
    result = await saveTargetRole(repo, {
      userId: user.id,
      input,
      recordId,
      requireJobDescription: !isTitlePath,
      sourceOccupation,
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

/**
 * Title-path autosuggest: return ranked O*NET occupation suggestions for a typed
 * prefix. Called from the client typeahead as the user types. Returns [] when
 * signed out or the prefix is too short (the page itself guards the route).
 */
export async function suggestOccupationsAction(
  prefix: string
): Promise<OccupationSuggestion[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }
  return searchOccupations(supabase, prefix);
}

/**
 * Title-path derivation: turn a chosen occupation (by SOC code) into a starter
 * requirement list the user then edits. Pure ranking lives in `occupation.ts`.
 */
export async function deriveOccupationRequirementsAction(
  code: string
): Promise<{ requirements: string[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const attributes = await getOccupationAttributes(supabase, code);
  return { requirements: buildRequirementsFromOccupation(attributes) };
}
