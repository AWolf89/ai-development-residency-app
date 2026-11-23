import "server-only";
import { createClient } from "@/lib/supabase/server";
import { runStructured } from "@/lib/llm/run";
import { supabaseSink } from "@/lib/llm/supabase-sink";
import { fileProposal } from "@/lib/llm/prompts/file-proposal";
import { saveProject } from "@/lib/projects/save";
import { createSupabaseProjectRepository } from "@/lib/projects/repository";
import { saveDecisionRecord } from "@/lib/decision-records/save";
import { createSupabaseDecisionRecordRepository } from "@/lib/decision-records/repository";
import { resolveFileText } from "../orchestrator";
import { groundProposal } from "./validate";
import { persistProposal } from "./persist";
import { proposalOutputSchema } from "./types";
import type {
  FileProposal,
  ProposalResult,
  ProposedProject,
  ProposedRecord,
} from "./types";

// The Auto-propose orchestrator (Humble Object, MVP 2 Phase 2). It performs the IO around the
// pure pieces: resolve a file's text, run ONE grounded proposal pass through the model gateway
// (runStructured + supabaseSink — one model path, ADR-0009), ground the output, and — only on an
// explicit approve — write the project + records through the existing deterministic save paths.
// It holds no control-flow logic; the FSM (machine.ts) and the grounding (validate.ts) do. RLS
// scopes every query to the signed-in owner (AC6).

async function currentUserId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Proposing records requires a signed-in user.");
  return user.id;
}

/**
 * Run one proposal pass for a file: resolve its text (vision for images, cached), then ask the
 * model to propose a project + evidence records, and ground the result. `priorAnswers` carries the
 * user's clarification answers on a re-run. This NEVER writes — it only proposes (AC3).
 */
export async function proposeFromFile(
  fileId: string,
  priorAnswers?: { question: string; answer: string }[]
): Promise<FileProposal> {
  const { text } = await resolveFileText(fileId);

  const { data } = await runStructured({
    prompt: fileProposal,
    input: { fileText: text, priorAnswers },
    schema: proposalOutputSchema,
    sink: supabaseSink,
  });

  const grounded = groundProposal(data);
  return {
    projectClear: data.projectClear,
    project: grounded.project,
    records: grounded.records,
    questions: data.questions.map((text) => ({ text })),
    droppedRecords: grounded.droppedRecords,
  };
}

/**
 * Persist an approved proposal (the HITL save). Reached only from the explicit approve action, so
 * the FSM's `persisting`-only-from-`approve` guarantee holds end to end. Binds the real project +
 * decision-record repositories and delegates to the tested, DI-driven `persistProposal`.
 */
export async function approveProposal(params: {
  fileId: string;
  project: ProposedProject | null;
  records: ProposedRecord[];
}): Promise<ProposalResult> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);

  const projectRepo = createSupabaseProjectRepository(supabase);
  const recordRepo = createSupabaseDecisionRecordRepository(supabase);

  return persistProposal(
    {
      saveProject: (p) => saveProject(projectRepo, p),
      saveDecisionRecord: (p) => saveDecisionRecord(recordRepo, p),
    },
    {
      userId,
      fileId: params.fileId,
      project: params.project,
      records: params.records,
    }
  );
}
