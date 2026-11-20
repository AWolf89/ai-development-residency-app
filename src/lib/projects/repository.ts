/**
 * Supabase-backed implementation of ProjectRepository (ADR-0019).
 *
 * A thin "humble" adapter: no business logic, only SDK calls, so all testable
 * logic stays in `save.ts` (tested with a fake). Mutations throw on error
 * (command/query separation). Own-rows RLS on `projects` scopes every write to
 * the signed-in user.
 */
import type { createClient } from "@/lib/supabase/server";
import type { ProjectRepository } from "./save";
import type { ProjectWriteRow } from "./mappers";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type SupabaseProjectRepository = ProjectRepository & {
  deleteProject(id: string): Promise<void>;
};

export function createSupabaseProjectRepository(
  supabase: ServerClient
): SupabaseProjectRepository {
  return {
    async insertProject(row: ProjectWriteRow) {
      const { data, error } = await supabase
        .from("projects")
        .insert(row)
        .select("id")
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return { id: data.id as string };
    },

    async updateProject(id: string, row: ProjectWriteRow) {
      const { error } = await supabase
        .from("projects")
        .update(row)
        .eq("id", id);
      if (error) {
        throw new Error(error.message);
      }
    },

    async deleteProject(id: string) {
      // Linked files / records / moments detach automatically (on delete set null).
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}
