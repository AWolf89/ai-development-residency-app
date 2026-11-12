/**
 * Supabase-backed implementation of DecisionRecordRepository.
 *
 * This is a thin "humble" adapter: it contains no business logic, only the
 * SDK calls, so all testable logic stays in `save.ts` (tested with a fake). It
 * throws on error (command/query separation: mutations throw, they don't return
 * error codes). Row-Level Security on both tables is what enforces AC7 — every
 * write is scoped to the signed-in user's own rows.
 */
import type { createClient } from "@/lib/supabase/server";
import type { DecisionRecordRepository } from "./save";
import type { DecisionRecordRow } from "./mappers";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export function createSupabaseDecisionRecordRepository(
  supabase: ServerClient
): DecisionRecordRepository {
  return {
    async insertRecord(row: DecisionRecordRow) {
      const { data, error } = await supabase
        .from("decision_records")
        .insert(row)
        .select("id")
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return { id: data.id as string };
    },

    async updateRecord(id: string, row: DecisionRecordRow) {
      const { error } = await supabase
        .from("decision_records")
        .update(row)
        .eq("id", id);
      if (error) {
        throw new Error(error.message);
      }
    },

    async setEvidenceLink({ userId, decisionRecordId, fileId }) {
      // Replace any existing link for this record (RLS scopes the delete to the
      // user's own rows) so editing never leaves duplicates.
      const { error: deleteError } = await supabase
        .from("evidence_links")
        .delete()
        .eq("decision_record_id", decisionRecordId);
      if (deleteError) {
        throw new Error(deleteError.message);
      }

      if (fileId) {
        const { error } = await supabase.from("evidence_links").insert({
          user_id: userId,
          decision_record_id: decisionRecordId,
          file_id: fileId,
        });
        if (error) {
          throw new Error(error.message);
        }
      }
    },
  };
}
