"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { StructuredOutputError } from "@/lib/llm/structured";
import { proposeFromFile, approveProposal } from "./orchestrator";
import { ProposalPersistError } from "./persist";
import {
  proposedProjectSchema,
  proposedRecordSchema,
  type FileProposal,
} from "./types";
import type { ProposalResult } from "./types";

/**
 * Server Actions for Auto-propose project & evidence records (MVP 2 Phase 2). Deliberately split
 * so the HITL property holds across the network boundary: `proposeRecordsAction` only proposes
 * (never writes), and `approveProposalAction` is the separate, explicit approve that persists
 * (AC3). Each re-checks auth rather than trusting the caller, and validates its input with Zod.
 */

export type ProposeResult =
  ({ ok: true } & FileProposal) | { ok: false; error: string };

const answersSchema = z
  .array(z.object({ question: z.string(), answer: z.string() }))
  .optional();

/** Run (or re-run, with clarification answers) one proposal pass; proposes, never saves. */
export async function proposeRecordsAction(
  fileId: string,
  priorAnswers?: { question: string; answer: string }[]
): Promise<ProposeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsedAnswers = answersSchema.safeParse(priorAnswers);
  if (!parsedAnswers.success) {
    return { ok: false, error: "Invalid clarification answers." };
  }

  try {
    const proposal = await proposeFromFile(fileId, parsedAnswers.data);
    return { ok: true, ...proposal };
  } catch (err) {
    console.error("file proposal failed", err);
    // AC5: a model/parse failure leaves the file untouched; the user can retry. When the model's
    // reply couldn't be validated (typically a very detailed file overrunning the output budget),
    // say so specifically and point to "Skip", which reviews what was already found without a
    // second pass — rather than a bare "try again" that would just repeat the same failure.
    const error =
      err instanceof StructuredOutputError
        ? "This file produced more detail than we could draft in one pass. Use “Skip” to review what was already found, or try a shorter or more focused file."
        : "Couldn't propose records for this file. Please try again.";
    return { ok: false, error };
  }
}

export type ApproveResult =
  { ok: true; result: ProposalResult } | { ok: false; error: string };

const approveInputSchema = z.object({
  fileId: z.string().min(1),
  project: proposedProjectSchema.nullable(),
  records: z.array(proposedRecordSchema),
});

/** The explicit approve: persist the project + records the user confirmed. Nothing else writes. */
export async function approveProposalAction(input: {
  fileId: string;
  project: FileProposal["project"];
  records: FileProposal["records"];
}): Promise<ApproveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = approveInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid proposal to save." };
  }
  if (!parsed.data.project && parsed.data.records.length === 0) {
    return { ok: false, error: "Nothing to save." };
  }

  try {
    const result = await approveProposal(parsed.data);
    revalidatePath("/dashboard/files");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/projects");
    return { ok: true, result };
  } catch (err) {
    console.error("saving proposal failed", err);
    const error =
      err instanceof ProposalPersistError
        ? err.message
        : "Couldn't save this proposal. Please try again.";
    return { ok: false, error };
  }
}
