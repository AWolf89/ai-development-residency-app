"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveProject } from "./save";
import { createSupabaseProjectRepository } from "./repository";

/** Result shape returned to the client after a project mutation. */
export type ProjectActionState = {
  ok?: boolean;
  projectId?: string;
  error?: string;
};

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/**
 * Thin Server Action (useActionState shape): resolve the signed-in user and
 * delegate to the tested `saveProject` orchestration (validate → insert/update).
 * A `project_id` hidden field selects edit over create. The user id is always
 * the server-resolved one, never a client-supplied value.
 */
export async function saveProjectAction(
  _prevState: ProjectActionState | undefined,
  formData: FormData
): Promise<ProjectActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const input = {
    name: str(formData.get("name")),
    role: str(formData.get("role")),
    organisation: str(formData.get("organisation")),
    summary: str(formData.get("summary")),
    status: str(formData.get("status")) || "active",
    startedOn: str(formData.get("started_on")),
    endedOn: str(formData.get("ended_on")),
  };
  const projectId = str(formData.get("project_id")) || null;

  const repo = createSupabaseProjectRepository(supabase);
  const result = await saveProject(repo, { userId: user.id, input, projectId });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/dashboard/projects");
  if (projectId) {
    revalidatePath(`/dashboard/projects/${projectId}`);
  }
  return { ok: true, projectId: result.projectId };
}

/**
 * Thin Server Action: delete one of the user's own projects. Linked files,
 * records, and moments are detached (`on delete set null`), not deleted. Reached
 * only from the UI's explicit confirm step.
 */
export async function deleteProjectAction(
  projectId: string
): Promise<ProjectActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const repo = createSupabaseProjectRepository(supabase);
  try {
    await repo.deleteProject(projectId);
  } catch {
    return { ok: false, error: "Could not delete that project. Please try again." };
  }

  revalidatePath("/dashboard/projects");
  return { ok: true };
}
