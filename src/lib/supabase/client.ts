import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in the browser (Client Components).
 *
 * The publishable/anon key is safe to expose: every table is still guarded by
 * Row-Level Security, so a signed-in user can only ever read or write their own
 * rows. See ADR-0003.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
