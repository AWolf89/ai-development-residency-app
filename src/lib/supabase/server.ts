import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use on the server (Server Components, Server Actions,
 * Route Handlers). It reads and writes the auth session from cookies so the
 * signed-in user is available on the server.
 *
 * Cache Components is disabled (ADR-0006), so reading cookies here needs no
 * Suspense boundary — this is the standard, documented Supabase SSR pattern.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component, where cookies cannot be set.
            // Safe to ignore: the middleware refreshes the session instead.
          }
        },
      },
    }
  );
}
