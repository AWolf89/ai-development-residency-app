/**
 * Supabase-backed implementation of FileRepository.
 *
 * A thin "humble" adapter: no business logic, only SDK calls, so all testable
 * logic stays in `record.ts` (tested with a fake). It throws on error
 * (command/query separation). Row-Level Security on the `files` table and the
 * `user-files` storage policies are what scope every write to the signed-in user.
 */
import type { createClient } from "@/lib/supabase/server";
import type { FileRepository, FileInsertRow } from "./record";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const BUCKET = "user-files";

export function createSupabaseFileRepository(
  supabase: ServerClient
): FileRepository {
  return {
    async insertFile(row: FileInsertRow) {
      const { data, error } = await supabase
        .from("files")
        .insert(row)
        .select("id")
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return { id: data.id as string };
    },

    async removeObject(storagePath: string) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .remove([storagePath]);
      if (error) {
        throw new Error(error.message);
      }
    },

    async deleteFile({ id }) {
      // Look up the row first (RLS-scoped) to get its storage key. Remove the
      // object before the row so a crash never leaves a row pointing at nothing.
      const { data, error } = await supabase
        .from("files")
        .select("storage_path")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      if (!data) {
        // Nothing to delete (already gone, or not the user's row under RLS).
        return;
      }

      const storagePath = data.storage_path as string;
      const { error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove([storagePath]);
      if (removeError) {
        throw new Error(removeError.message);
      }

      const { error: deleteError } = await supabase
        .from("files")
        .delete()
        .eq("id", id);
      if (deleteError) {
        throw new Error(deleteError.message);
      }
    },
  };
}
