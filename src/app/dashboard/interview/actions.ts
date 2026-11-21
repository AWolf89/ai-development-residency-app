"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  defaultDeps,
  startInterview,
  startTimelineInterview,
  confirmTimeline,
  submitAnswer,
  skipQuestion,
  pauseInterview,
  acceptDraft,
  editDraft,
  resumeInterview,
} from "@/lib/interview/orchestrator";
import { timelineSchema } from "@/lib/interview/timeline";

const PATH = "/dashboard/interview";

/**
 * Thin Server Actions for the Reasoning Interview. Each re-checks auth (defence in depth),
 * builds the RLS-scoped orchestrator dependencies for the signed-in user, delegates to the
 * tested orchestrator, and revalidates the page. No business logic lives here — the FSM +
 * orchestrator own the decisions, and the save gate is enforced there (ADR-0013).
 */
async function userIdOrRedirect(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function startInterviewAction(formData: FormData): Promise<void> {
  const userId = await userIdOrRedirect();
  const title = field(formData, "title");
  if (!title) return;
  const targetRoleId = field(formData, "target_role_id") || null;
  const projectId = field(formData, "project_id") || null;
  const deps = await defaultDeps(userId);
  // A project turns this into a timeline-anchored Decision-Point Interview (ADR-0021): draft a
  // timeline from that project's files for the user to correct. Without one, the open CDM flow.
  if (projectId) {
    await startTimelineInterview(deps, {
      userId,
      title,
      projectId,
      targetRoleId,
    });
  } else {
    await startInterview(deps, { userId, title, targetRoleId });
  }
  revalidatePath(PATH);
}

export async function confirmTimelineAction(formData: FormData): Promise<void> {
  const userId = await userIdOrRedirect();
  const sessionId = field(formData, "session_id");
  const raw = field(formData, "timeline");
  if (!sessionId) return;
  // The client sends the corrected timeline as JSON; validate it before the orchestrator persists.
  let timeline;
  try {
    timeline = timelineSchema.parse(JSON.parse(raw || "[]"));
  } catch {
    return; // malformed payload: do nothing (the page re-drafts on reload)
  }
  const deps = await defaultDeps(userId);
  await confirmTimeline(deps, { sessionId, userId, timeline });
  revalidatePath(PATH);
}

export async function submitAnswerAction(formData: FormData): Promise<void> {
  const userId = await userIdOrRedirect();
  const sessionId = field(formData, "session_id");
  const answer = field(formData, "answer");
  if (!sessionId) return;
  const deps = await defaultDeps(userId);
  await submitAnswer(deps, { sessionId, userId, answer });
  revalidatePath(PATH);
}

export async function skipAction(formData: FormData): Promise<void> {
  const userId = await userIdOrRedirect();
  const sessionId = field(formData, "session_id");
  if (!sessionId) return;
  const deps = await defaultDeps(userId);
  await skipQuestion(deps, { sessionId, userId });
  revalidatePath(PATH);
}

export async function pauseAction(formData: FormData): Promise<void> {
  const userId = await userIdOrRedirect();
  const sessionId = field(formData, "session_id");
  if (!sessionId) return;
  const deps = await defaultDeps(userId);
  await pauseInterview(deps, { sessionId, userId });
  revalidatePath(PATH);
}

export async function acceptAction(formData: FormData): Promise<void> {
  const userId = await userIdOrRedirect();
  const sessionId = field(formData, "session_id");
  if (!sessionId) return;
  const deps = await defaultDeps(userId);
  await acceptDraft(deps, { sessionId, userId });
  revalidatePath(PATH);
}

export async function editAction(formData: FormData): Promise<void> {
  const userId = await userIdOrRedirect();
  const sessionId = field(formData, "session_id");
  if (!sessionId) return;
  const deps = await defaultDeps(userId);
  await editDraft(deps, { sessionId, userId });
  revalidatePath(PATH);
}

export async function resumeAction(formData: FormData): Promise<void> {
  const userId = await userIdOrRedirect();
  const sessionId = field(formData, "session_id");
  if (!sessionId) return;
  const deps = await defaultDeps(userId);
  await resumeInterview(deps, { sessionId, userId });
  revalidatePath(PATH);
}
