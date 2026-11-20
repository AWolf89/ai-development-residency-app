/**
 * Supabase-backed implementation of FileHubRepository (ADR-0019).
 *
 * A thin "humble" adapter: only SDK calls, so all testable logic stays in
 * `hub.ts` (tested with a fake). Mutations throw on error. Own-rows RLS scopes
 * every write to the signed-in user, and the INSERT policies verify the linked
 * project / file / record is the caller's own (defence in depth).
 */
import type { createClient } from "@/lib/supabase/server";
import type { FileHubRepository } from "./hub";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export function createSupabaseFileHubRepository(
  supabase: ServerClient
): FileHubRepository {
  return {
    async setCaption(fileId: string, caption: string | null) {
      const { error } = await supabase
        .from("files")
        .update({ caption })
        .eq("id", fileId);
      if (error) {
        throw new Error(error.message);
      }
    },

    async setProject(fileId: string, projectId: string | null) {
      const { error } = await supabase
        .from("files")
        .update({ project_id: projectId })
        .eq("id", fileId);
      if (error) {
        throw new Error(error.message);
      }
    },

    async insertRecordLink({ userId, fileId, decisionRecordId }) {
      const { error } = await supabase.from("evidence_links").insert({
        user_id: userId,
        decision_record_id: decisionRecordId,
        file_id: fileId,
      });
      if (error) {
        throw new Error(error.message);
      }
    },

    async deleteRecordLink(linkId: string) {
      const { error } = await supabase
        .from("evidence_links")
        .delete()
        .eq("id", linkId);
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}
