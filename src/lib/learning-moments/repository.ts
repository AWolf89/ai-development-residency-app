/**
 * Supabase-backed implementation of LearningMomentRepository (ADR-0018).
 *
 * A thin "humble" adapter: no business logic, only the SDK calls, so all testable logic stays
 * in `save.ts` (tested with a fake). It throws on error (command/query separation: mutations
 * throw, they don't return error codes). Row-Level Security on `learning_moments` and
 * `evidence_links` is what enforces AC5 — every write is scoped to the signed-in user's own
 * rows, and the link's INSERT policy also verifies the learning moment is the caller's own.
 */
import type { createClient } from "@/lib/supabase/server";
import type { LearningMomentRepository } from "./save";
import type { LearningMomentRow } from "./mappers";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export function createSupabaseLearningMomentRepository(
  supabase: ServerClient
): LearningMomentRepository {
  return {
    async insertRecord(row: LearningMomentRow) {
      const { data, error } = await supabase
        .from("learning_moments")
        .insert(row)
        .select("id")
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return { id: data.id as string };
    },

    async updateRecord(id: string, row: LearningMomentRow) {
      const { error } = await supabase
        .from("learning_moments")
        .update(row)
        .eq("id", id);
      if (error) {
        throw new Error(error.message);
      }
    },

    async setEvidenceLink({ userId, learningMomentId, fileId }) {
      // Replace any existing link for this moment (RLS scopes the delete to the user's own
      // rows) so editing never leaves duplicates.
      const { error: deleteError } = await supabase
        .from("evidence_links")
        .delete()
        .eq("learning_moment_id", learningMomentId);
      if (deleteError) {
        throw new Error(deleteError.message);
      }

      if (fileId) {
        const { error } = await supabase.from("evidence_links").insert({
          user_id: userId,
          learning_moment_id: learningMomentId,
          file_id: fileId,
        });
        if (error) {
          throw new Error(error.message);
        }
      }
    },
  };
}
