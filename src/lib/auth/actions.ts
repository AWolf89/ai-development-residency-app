"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateCredentials } from "@/lib/auth/validation";

/**
 * Result shape returned to a form via `useActionState`.
 * `error` shows a problem; `notice` shows a non-error message (e.g. "check your
 * email"). A successful login/signup redirects instead of returning.
 */
export type AuthState = {
  error?: string;
  notice?: string;
};

export async function login(
  _prevState: AuthState | undefined,
  formData: FormData
): Promise<AuthState> {
  const result = validateCredentials(
    formData.get("email"),
    formData.get("password")
  );
  if (!result.ok) {
    return { error: result.error };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(result.value);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(
  _prevState: AuthState | undefined,
  formData: FormData
): Promise<AuthState> {
  const result = validateCredentials(
    formData.get("email"),
    formData.get("password")
  );
  if (!result.ok) {
    return { error: result.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(result.value);
  if (error) {
    return { error: error.message };
  }

  // When email confirmation is required, no session is returned yet.
  if (!data.session) {
    return {
      notice:
        "Account created. Check your email to confirm your address, then log in.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
