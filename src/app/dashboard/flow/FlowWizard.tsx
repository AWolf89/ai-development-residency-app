"use client";

import { useState, useTransition } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  advanceRunAction,
  completeStepAction,
  resumeRunAction,
  skipStepAction,
} from "@/lib/orchestrator/actions";
import type {
  OrchestrationRunResult,
  StepProposal,
} from "@/lib/orchestrator/orchestrator";
import type { OrchestrationState, StepKey } from "@/lib/orchestrator/types";
import type { InvestigationItem } from "@/lib/investigations/types";
import type { FileReconciliation } from "@/lib/file-analysis/reconciliation/orchestrator";
import type { FileProposal } from "@/lib/file-analysis/proposal/types";
import type { ReviewFlag } from "@/lib/reviewer/types";
import { activePanel, stepLabel, STEP_LABEL } from "@/lib/flow/presentation";
import { brand, serifStack } from "@/theme-tokens";
import StatusChip from "@/components/StatusChip";
import InvestigationsView from "@/app/dashboard/investigations/InvestigationsView";
import ReconcileDialog from "@/app/dashboard/files/ReconcileDialog";
import ProposeRecordsDialog from "@/app/dashboard/files/ProposeRecordsDialog";
import ReviewPanel from "@/app/dashboard/decision-records/[id]/review/ReviewPanel";
import FlowStepRail from "./FlowStepRail";

type Props = {
  runId: string;
  fileId: string;
  fileName: string;
  interviewComplete: boolean;
  reviewRecordId: string | null;
  initialState: OrchestrationState;
  initialProposal: StepProposal | null;
  initialQueue: InvestigationItem[] | null;
};

const PANEL_CARD_SX = {
  borderColor: brand.hairline,
  bgcolor: "#fff",
} as const;

/** Short, honest copy for each step's "run" card — what the step does, no promises about results. */
const RUN_COPY: Record<StepKey, string> = {
  reconcile:
    "Compare this file against your existing evidence and surface any conflicts or overlaps. Nothing is changed in your records.",
  propose:
    "Read this file and draft a project and evidence records it supports. Nothing is saved until you approve.",
  interview:
    "Walk through the decisions behind this work in your own words — timeline-anchored when a project was created.",
  review:
    "Check the saved record against your evidence for anything unsupported, overstated, or vague.",
};

const RUN_BUTTON: Record<StepKey, string> = {
  reconcile: "Check for conflicts",
  propose: "Propose records",
  interview: "Start the interview",
  review: "Run the review",
};

/**
 * The guided-flow wizard (MVP 2 Phase 4 follow-up). A thin client that drives ONLY the existing
 * orchestrator Server Actions and reuses each agent's existing review/save component. It adds no
 * reasoning and never saves evidence itself (AC1): `advanceRun` proposes the current step, the
 * step's own component renders that proposal and calls the AGENT'S own accept-only save (its HITL
 * gate — AC2), then `completeStep` advances. The durable rail comes from the run's state; reopening
 * the page rehydrates where the user left off (AC3). A failed step offers Retry with prior saves
 * intact (AC4). All state lives in the tested backend; this orchestrates clicks, not data.
 */
export default function FlowWizard({
  runId,
  fileId,
  fileName,
  interviewComplete,
  reviewRecordId,
  initialState,
  initialProposal,
  initialQueue,
}: Props) {
  const [state, setState] = useState<OrchestrationState>(initialState);
  const [proposal, setProposal] = useState<StepProposal | null>(
    initialProposal
  );
  const [queue, setQueue] = useState<InvestigationItem[] | null>(initialQueue);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(result: OrchestrationRunResult) {
    setState(result.state);
    setProposal(result.proposal);
    setQueue(result.queue);
  }

  /** Run a Server Action and fold its result in; a thrown error surfaces without losing position. */
  function drive(
    fn: () => Promise<OrchestrationRunResult>,
    failMessage: string
  ) {
    setError(null);
    startTransition(async () => {
      try {
        apply(await fn());
      } catch {
        setError(failMessage);
      }
    });
  }

  const advance = () =>
    drive(
      () => advanceRunAction({ runId }),
      "Couldn't start this step. Please try again."
    );

  /** The agent's own HITL save already ran inside the step component; record it and advance. */
  const completeStep = () =>
    drive(
      () => completeStepAction({ runId }),
      "Your save went through, but advancing the flow failed. Reload to continue."
    );

  const skipStep = () =>
    drive(
      () => skipStepAction({ runId }),
      "Couldn't skip this step. Please try again."
    );

  // Retry a failed step: reopen it (resume), then run its propose entry point again. Prior saves
  // are untouched by both (AC4).
  const retry = () =>
    drive(async () => {
      await resumeRunAction({ runId });
      return advanceRunAction({ runId });
    }, "Couldn't retry this step. Please try again.");

  // Skip past a failed step: reopen it, then skip it so the flow moves on.
  const skipFailed = () =>
    drive(async () => {
      await resumeRunAction({ runId });
      return skipStepAction({ runId });
    }, "Couldn't skip this step. Please try again.");

  const panel = activePanel(state);
  const cursor = state.cursor;

  const heading =
    panel === "complete"
      ? `Evidence from ${fileName} is in`
      : panel === "failed"
        ? "A step didn’t finish — your saved work is safe"
        : `Let’s build evidence from ${fileName}`;

  const subheading =
    panel === "complete"
      ? "Every step you approved is saved. Here’s what to look at next."
      : panel === "failed"
        ? `The ${stepLabel(state.failureStep)} step hit an error. Everything you approved before it is safe.`
        : "Each step runs for you. You review and approve before anything is saved.";

  return (
    <Stack spacing={4}>
      <Stack spacing={1}>
        <Typography
          variant="overline"
          sx={{ color: brand.tag.blue.fg, letterSpacing: 0.8 }}
        >
          Guided flow
          {panel === "complete"
            ? " · complete"
            : panel === "failed"
              ? " · paused"
              : ""}
        </Typography>
        <Typography
          component="h1"
          sx={{ fontFamily: serifStack, fontSize: { xs: 28, md: 40 }, m: 0 }}
        >
          {heading}
        </Typography>
        <Typography color="text.secondary">{subheading}</Typography>
      </Stack>

      <FlowStepRail state={state} />

      {error ? (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      ) : null}

      {pending ? (
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: "center", py: 1 }}
        >
          <CircularProgress size={20} aria-hidden="true" />
          <Typography role="status">Working…</Typography>
        </Stack>
      ) : null}

      {panel === "run" && cursor ? (
        <RunPanel
          step={cursor}
          disabled={pending}
          onRun={advance}
          onSkip={skipStep}
        />
      ) : null}

      {panel === "review" && cursor ? (
        <ReviewStepPanel
          step={cursor}
          fileId={fileId}
          fileName={fileName}
          proposal={proposal}
          reviewRecordId={reviewRecordId}
          disabled={pending}
          onSaved={completeStep}
          onSkip={skipStep}
        />
      ) : null}

      {panel === "interview" ? (
        <InterviewPanel
          interviewComplete={interviewComplete}
          disabled={pending}
          onDone={completeStep}
          onSkip={skipStep}
        />
      ) : null}

      {panel === "failed" ? (
        <FailedPanel
          step={state.failureStep}
          disabled={pending}
          onRetry={retry}
          onSkip={skipFailed}
        />
      ) : null}

      {panel === "complete" ? <CompletePanel queue={queue} /> : null}
    </Stack>
  );
}

/** A step the flow hasn't run yet: explain it and offer to run or skip it. */
function RunPanel({
  step,
  disabled,
  onRun,
  onSkip,
}: {
  step: StepKey;
  disabled: boolean;
  onRun: () => void;
  onSkip: () => void;
}) {
  return (
    <Card variant="outlined" sx={PANEL_CARD_SX}>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            {STEP_LABEL[step]}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {RUN_COPY[step]}
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="contained"
              onClick={onRun}
              disabled={disabled}
              sx={{ bgcolor: "#c2561f", "&:hover": { bgcolor: "#a84716" } }}
            >
              {RUN_BUTTON[step]}
            </Button>
            <Button variant="text" onClick={onSkip} disabled={disabled}>
              Skip this step
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

/** A proposed step: render the agent's OWN review/save component for the proposal, then advance. */
function ReviewStepPanel({
  step,
  fileId,
  fileName,
  proposal,
  reviewRecordId,
  disabled,
  onSaved,
  onSkip,
}: {
  step: StepKey;
  fileId: string;
  fileName: string;
  proposal: StepProposal | null;
  reviewRecordId: string | null;
  disabled: boolean;
  onSaved: () => void;
  onSkip: () => void;
}) {
  // Use the orchestrator's already-computed proposal when it's in hand (fresh advance); on reopen
  // it's null and each component self-fetches its own pass.
  const payload = proposal && proposal.step === step ? proposal.payload : null;

  return (
    <Card variant="outlined" sx={PANEL_CARD_SX}>
      <CardContent>
        <Stack spacing={2}>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <Typography variant="h6" component="h2">
              {STEP_LABEL[step]}
            </Typography>
            <StatusChip label="Needs your review" tone="blue" />
          </Stack>

          {step === "reconcile" ? (
            <ReconcileDialog
              fileId={fileId}
              fileName={fileName}
              onSaved={onSaved}
              triggerLabel="Review conflicts"
              initialProposal={
                payload ? (payload as FileReconciliation) : undefined
              }
            />
          ) : null}

          {step === "propose" ? (
            <ProposeRecordsDialog
              fileId={fileId}
              fileName={fileName}
              onSaved={onSaved}
              triggerLabel="Review proposed records"
              initialProposal={payload ? (payload as FileProposal) : undefined}
            />
          ) : null}

          {step === "review" ? (
            reviewRecordId ? (
              <ReviewPanel
                recordId={reviewRecordId}
                alreadyReviewed={false}
                priorFlags={[]}
                hideBackLink
                onAccepted={onSaved}
                initialProposal={
                  payload
                    ? {
                        flags:
                          (payload as { state?: { flags?: ReviewFlag[] } })
                            .state?.flags ?? [],
                      }
                    : undefined
                }
              />
            ) : (
              <Typography variant="body2" color="text.secondary">
                There’s no saved record from this file to review yet. Skip this
                step, or go back and approve a record in the propose step first.
              </Typography>
            )
          ) : null}

          <Box>
            <Button variant="text" onClick={onSkip} disabled={disabled}>
              Skip this step
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

/** The interview sub-flow: hand off to its existing UI, mark done once its session completes. */
function InterviewPanel({
  interviewComplete,
  disabled,
  onDone,
  onSkip,
}: {
  interviewComplete: boolean;
  disabled: boolean;
  onDone: () => void;
  onSkip: () => void;
}) {
  return (
    <Card variant="outlined" sx={PANEL_CARD_SX}>
      <CardContent>
        <Stack spacing={2}>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <Typography variant="h6" component="h2">
              {STEP_LABEL.interview}
            </Typography>
            <StatusChip
              label={interviewComplete ? "Interview complete" : "In progress"}
              tone={interviewComplete ? "green" : "blue"}
            />
          </Stack>
          {interviewComplete ? (
            <>
              <Typography variant="body2" color="text.secondary">
                Your interview is finished and its records are saved. Mark this
                step done to continue to the review.
              </Typography>
              <Stack direction="row" spacing={1.5}>
                <Button
                  variant="contained"
                  onClick={onDone}
                  disabled={disabled}
                  sx={{ bgcolor: "#c2561f", "&:hover": { bgcolor: "#a84716" } }}
                >
                  Mark interview done &amp; continue
                </Button>
              </Stack>
            </>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                The interview runs on its own page and saves through its own
                approval gate. Continue there, then come back — this step
                completes once that session is done.
              </Typography>
              <Stack direction="row" spacing={1.5}>
                <Button
                  variant="contained"
                  href="/dashboard/interview"
                  sx={{ bgcolor: "#c2561f", "&:hover": { bgcolor: "#a84716" } }}
                >
                  Continue the interview
                </Button>
                <Button variant="text" onClick={onSkip} disabled={disabled}>
                  Skip this step
                </Button>
              </Stack>
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

/** A failed step: your saved work is safe; retry just this step, skip it, or leave for later. */
function FailedPanel({
  step,
  disabled,
  onRetry,
  onSkip,
}: {
  step: StepKey | null;
  disabled: boolean;
  onRetry: () => void;
  onSkip: () => void;
}) {
  const label = stepLabel(step);
  return (
    <Stack spacing={2}>
      <Alert severity="warning" sx={{ alignItems: "center" }}>
        The {label} step couldn’t finish. No records were lost — every step you
        approved before it is still saved.
      </Alert>
      <Card variant="outlined" sx={PANEL_CARD_SX}>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" component="h2">
              Resume from the {label} step
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Retrying re-runs only this step. Your already-approved saves stay
              exactly as they are.
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap" }}>
              <Button
                variant="contained"
                onClick={onRetry}
                disabled={disabled}
                sx={{ bgcolor: "#c2561f", "&:hover": { bgcolor: "#a84716" } }}
              >
                Retry {label.toLowerCase()}
              </Button>
              <Button variant="outlined" onClick={onSkip} disabled={disabled}>
                Skip this step
              </Button>
              <Button variant="text" href="/dashboard/files">
                Leave for later
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

/** The terminal surface: the derived Investigation Queue plus the next moves. */
function CompletePanel({ queue }: { queue: InvestigationItem[] | null }) {
  const items = queue ?? [];
  return (
    <Stack spacing={3}>
      <Card variant="outlined" sx={PANEL_CARD_SX}>
        <CardContent>
          <Stack spacing={2}>
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: "center", flexWrap: "wrap" }}
            >
              <Typography variant="h6" component="h2">
                Investigation queue
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Derived from your evidence · {items.length} item
                {items.length === 1 ? "" : "s"}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              What to investigate next, highest-impact first.
            </Typography>
            <InvestigationsView items={items} />
          </Stack>
        </CardContent>
      </Card>
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap" }}>
        <Button
          variant="contained"
          href="/dashboard/investigations"
          sx={{ bgcolor: "#c2561f", "&:hover": { bgcolor: "#a84716" } }}
        >
          Open the full queue
        </Button>
        <Button variant="outlined" href="/dashboard/flow">
          Start another file
        </Button>
      </Stack>
    </Stack>
  );
}
