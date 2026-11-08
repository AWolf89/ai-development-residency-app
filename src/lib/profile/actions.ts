"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = {
  error?: string;
  notice?: string;
};

/**
 * Updates the signed-in user's own display name on their `profiles` row.
 * Row-Level Security guarantees a user can only ever update their own row.
 */
export async function updateDisplayName(
  _prevState: ProfileState | undefined,
  formData: FormData
): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const displayName = String(formData.get("display_name") ?? "").trim();

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName === "" ? null : displayName })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { notice: "Saved." };
}
