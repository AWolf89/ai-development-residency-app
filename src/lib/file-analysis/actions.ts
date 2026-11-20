"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  analyzeFile,
  analyzeAllForCurrentUser,
  type BatchSummary,
} from "./orchestrator";
import { saveFileAnalysis } from "./persistence";
import {
  proposedTagSchema,
  type ClarifyingQuestion,
  type ProposedTag,
} from "./types";

/**
 * Server Actions for File Analysis & Tagging (ADR-0020). Deliberately split so the HITL property
 * holds across the network boundary: `analyzeFileAction` only proposes (never writes tags), and
 * `saveFileTagsAction` is the separate, explicit accept that persists. Each re-checks auth rather
 * than trusting the caller, and validates its input with Zod.
 */

export type AnalyzeResult =
  | {
      ok: true;
      summary: string;
      tags: ProposedTag[];
      questions: ClarifyingQuestion[];
      candidateCount: number;
    }
  | { ok: false; error: string };

const answersSchema = z
  .array(z.object({ question: z.string(), answer: z.string() }))
  .optional();

/** Run (or re-run, with clarification answers) one analysis pass; proposes, never saves. */
export async function analyzeFileAction(
  fileId: string,
  priorAnswers?: { question: string; answer: string }[]
): Promise<AnalyzeResult> {
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
    const result = await analyzeFile(fileId, parsedAnswers.data);
    return {
      ok: true,
      summary: result.summary,
      tags: result.tags,
      questions: result.questions,
      candidateCount: result.candidateCount,
    };
  } catch (err) {
    console.error("file analysis failed", err);
    return {
      ok: false,
      error: "Couldn't analyze this file. Please try again.",
    };
  }
}

export type SaveResult = { ok: true } | { ok: false; error: string };

const saveInputSchema = z.object({
  fileId: z.string().min(1),
  summary: z.string(),
  tags: z.array(proposedTagSchema),
});

/** The explicit accept: persist the accepted tags and re-index the file's evidence. */
export async function saveFileTagsAction(input: {
  fileId: string;
  summary: string;
  tags: ProposedTag[];
}): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid tags to save." };
  }

  try {
    await saveFileAnalysis(parsed.data);
    revalidatePath(`/dashboard/files/${parsed.data.fileId}`);
    revalidatePath("/dashboard/files");
    return { ok: true };
  } catch (err) {
    console.error("saving file analysis failed", err);
    return { ok: false, error: "Couldn't save these tags. Please try again." };
  }
}

export type BatchResult =
  { ok: true; summary: BatchSummary } | { ok: false; error: string };

/** Batch "Analyze all": analyze every not-yet-analyzed file; auto-tag the confident ones. */
export async function analyzeAllAction(): Promise<BatchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    const summary = await analyzeAllForCurrentUser();
    revalidatePath("/dashboard/files");
    return { ok: true, summary };
  } catch (err) {
    console.error("batch file analysis failed", err);
    return {
      ok: false,
      error: "Couldn't analyze your files. Please try again.",
    };
  }
}
