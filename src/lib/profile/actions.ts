"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = {
  error?: string;
  notice?: string;
};

/**
 * Saves the signed-in user's own display name to their `profiles` row.
 *
 * Uses upsert (insert-or-update keyed on the user id) so it works whether or
 * not the auto-create-profile trigger has already made the row — for example
 * for accounts created before the trigger existed. Row-Level Security still
 * guarantees a user can only ever write their own row.
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
    .upsert(
      { id: user.id, display_name: displayName === "" ? null : displayName },
      { onConflict: "id" }
    );

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { notice: "Saved." };
}
