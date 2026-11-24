import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { getFiles } from "@/lib/files/queries";
import { getRunAction, startRunAction } from "@/lib/orchestrator/actions";
import { getFlowRunMeta } from "@/lib/flow/queries";
import { serifStack } from "@/theme-tokens";
import FlowStart from "./FlowStart";
import FlowWizard from "./FlowWizard";

const PAGE_SX = {
  px: { xs: 2, md: 7 },
  py: { xs: 4, md: 6 },
  maxWidth: 1180,
} as const;

/**
 * The guided-flow wizard page (MVP 2 Phase 4 follow-up). UI only: it reads the run position via the
 * existing `getRunAction` (and a read-only metadata query for the heading / interview status), then
 * drives the orchestrator Server Actions through the client wizard. It adds no reasoning and no new
 * save path — every side effect still goes through each agent's own HITL gate (AC1/AC2).
 *
 *  - `?run=<id>`  → rehydrate that run and resume where the user left off (AC3).
 *  - `?file=<id>` → start a fresh run on that file and redirect to its `?run=<id>`.
 *  - neither      → the start screen: pick an uploaded file to begin.
 */
export default async function FlowPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; file?: string }>;
}) {
  const { run, file } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Start from a specific file: begin a run, then hand off to its stable run URL.
  if (!run && file) {
    const result = await startRunAction({ fileId: file });
    redirect(`/dashboard/flow?run=${result.runId}`);
  }

  if (run) {
    const [result, meta] = await Promise.all([
      getRunAction({ runId: run }),
      getFlowRunMeta(supabase, run),
    ]);
    if (meta) {
      return (
        <Box sx={PAGE_SX}>
          <FlowWizard
            runId={run}
            fileId={meta.fileId}
            fileName={meta.fileName}
            interviewComplete={meta.interviewComplete}
            reviewRecordId={meta.reviewRecordId}
            initialState={result.state}
            initialProposal={result.proposal}
            initialQueue={result.queue}
          />
        </Box>
      );
    }
    // A run id that isn't the user's (or was removed): fall through to the start screen.
  }

  const files = await getFiles(supabase, user.id);
  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={4}>
        <Stack spacing={1}>
          <Typography
            component="h1"
            sx={{ fontFamily: serifStack, fontSize: { xs: 30, md: 44 }, m: 0 }}
          >
            Guided flow
          </Typography>
          <Typography color="text.secondary">
            Walk one document through reconcile → propose → interview → review,
            approving each step as you go.
          </Typography>
        </Stack>
        <FlowStart
          files={files.map((f) => ({
            id: f.id as string,
            fileName: f.file_name as string,
          }))}
        />
      </Stack>
    </Box>
  );
}
