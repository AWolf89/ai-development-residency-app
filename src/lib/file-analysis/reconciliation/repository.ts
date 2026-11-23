import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ReconciliationFlagRepository } from "./persist";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Supabase-backed ReconciliationFlagRepository (ADR-0023). A thin "humble" adapter: no business
 * logic, only the SDK call. It throws on error (command/query separation). Row-Level Security on
 * `reconciliation_flags` enforces own-rows — every insert is scoped to the signed-in user's rows.
 */
export function createSupabaseReconciliationFlagRepository(
  supabase: ServerClient
): ReconciliationFlagRepository {
  return {
    async insertFlags(rows) {
      if (rows.length === 0) {
        return { ids: [] };
      }
      const { data, error } = await supabase
        .from("reconciliation_flags")
        .insert(rows)
        .select("id");
      if (error) {
        throw new Error(error.message);
      }
      return { ids: (data ?? []).map((r) => r.id as string) };
    },
  };
}
