"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getTargetRoleById,
  getRequirementsForRoles,
} from "@/lib/target-roles/queries";
import {
  classifyRoleRequirements,
  saveAssessments,
} from "@/lib/gap/classifier";

/**
 * Run the grounded gap check for one target role on demand (ADR-0012): classify every
 * requirement against the user's evidence and persist the results. Deliberately a user
 * action (one model call per requirement, ADR-0011), never run on page load.
 *
 * Defence in depth: this is its own endpoint, so it re-checks auth and role ownership
 * rather than trusting the page that rendered the button.
 */
export async function runGapCheck(formData: FormData): Promise<void> {
  const roleId = String(formData.get("roleId") ?? "");
  if (!roleId) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // RLS scopes this to the owner; a role the caller does not own comes back null.
  const role = await getTargetRoleById(supabase, roleId);
  if (!role) {
    return;
  }

  const requirements = await getRequirementsForRoles(supabase, [roleId]);
  if (requirements.length === 0) {
    return;
  }

  const gaps = await classifyRoleRequirements(
    requirements.map((req) => ({ id: req.id, text: req.requirement_text }))
  );
  await saveAssessments(gaps, { userId: user.id, targetRoleId: roleId });

  revalidatePath("/dashboard/gap-check");
}
