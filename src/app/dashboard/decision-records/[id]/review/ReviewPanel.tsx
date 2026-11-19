"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { FlagSeverity, ReviewFlag } from "@/lib/reviewer/types";
import { runReviewAction, acceptReviewAction } from "./actions";

const DIMENSION_LABEL: Record<ReviewFlag["dimension"], string> = {
  support: "Unsupported claim",
  accuracy: "Possible overstatement",
  specificity: "Too vague",
  completeness: "Missing detail",
};

const SEVERITY_COLOR: Record<FlagSeverity, "default" | "warning" | "error"> = {
  info: "default",
  caution: "warning",
  serious: "error",
};

type Phase = "idle" | "proposed" | "done";

/**
 * The client side of the Reviewer Agent Check (ADR-0016). It runs the review (which returns the
 * proposed flags WITHOUT persisting them), lets the user dismiss any flag, and only on "Accept
 * review" calls the orchestrator's accept — the single HITL-gated edge that writes the flags and
 * marks the record reviewed. "Reject" discards the proposal and writes nothing.
 */
export default function ReviewPanel({
  recordId,
  alreadyReviewed,
  priorFlags,
}: {
  recordId: string;
  alreadyReviewed: boolean;
  priorFlags: ReviewFlag[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>(alreadyReviewed ? "done" : "idle");
  const [flags, setFlags] = useState<ReviewFlag[]>(priorFlags);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await runReviewAction(recordId);
        setFlags(result.flags);
        setPhase(result.status === "paused" ? "idle" : "proposed");
        if (result.status === "paused") {
          setError("The reviewer could not finish. Please try again.");
        }
      } catch {
        setError("Something went wrong running the review. Please try again.");
      }
    });
  };

  const toggleDismiss = (index: number) => {
    setFlags((current) =>
      current.map((f, i) =>
        i === index
          ? {
              ...f,
              disposition:
                f.disposition === "dismissed" ? "pending" : "dismissed",
            }
          : f
      )
    );
  };

  const accept = () => {
    setError(null);
    startTransition(async () => {
      try {
        await acceptReviewAction(recordId, flags);
        setPhase("done");
      } catch {
        setError("Could not save the review. Please try again.");
      }
    });
  };

  const reject = () => {
    setFlags([]);
    setPhase("idle");
  };

  const activeFlags = flags.filter((f) => f.disposition !== "dismissed");

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}

      {phase === "done" && (
        <Alert severity="success">
          This record has been reviewed.{" "}
          {flags.length === 0
            ? "No issues were flagged."
            : `${activeFlags.length} flag(s) kept.`}
        </Alert>
      )}

      {phase === "idle" && (
        <Box>
          <Typography variant="body1" sx={{ mb: 2 }}>
            The reviewer checks this record against your own uploaded evidence
            and flags claims that are unsupported, overstated, vague, or missing
            detail. Nothing is saved until you accept.
          </Typography>
          <Button variant="contained" onClick={run} disabled={pending}>
            {pending ? "Reviewing…" : "Run review"}
          </Button>
        </Box>
      )}

      {(phase === "proposed" || (phase === "done" && flags.length > 0)) && (
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            {phase === "proposed" ? "Flags to review" : "Flags on this record"}
          </Typography>
          {flags.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No issues were flagged — this record looks well-supported and
              specific.
            </Typography>
          )}
          {flags.map((flag, index) => (
            <Card
              key={index}
              variant="outlined"
              sx={{ opacity: flag.disposition === "dismissed" ? 0.5 : 1 }}
            >
              <CardContent>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mb: 1, flexWrap: "wrap" }}
                >
                  <Chip
                    size="small"
                    color={SEVERITY_COLOR[flag.severity]}
                    label={flag.severity}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={DIMENSION_LABEL[flag.dimension]}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={flag.targetField}
                  />
                </Stack>
                <Typography variant="body1">{flag.message}</Typography>
                {flag.citations.length > 0 && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    Evidence: {flag.citations.map((c) => c.title).join(", ")}
                  </Typography>
                )}
                {phase === "proposed" && (
                  <Button
                    size="small"
                    onClick={() => toggleDismiss(index)}
                    sx={{ mt: 1 }}
                    disabled={pending}
                  >
                    {flag.disposition === "dismissed"
                      ? "Keep this flag"
                      : "Dismiss this flag"}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {phase === "proposed" && (
        <Stack direction="row" spacing={1.5}>
          <Button variant="contained" onClick={accept} disabled={pending}>
            {pending ? "Saving…" : "Accept review"}
          </Button>
          <Button variant="outlined" onClick={reject} disabled={pending}>
            Reject
          </Button>
        </Stack>
      )}

      {phase === "done" && (
        <Box>
          <Button
            variant="text"
            onClick={() =>
              router.push(`/dashboard/decision-records/${recordId}`)
            }
          >
            Back to the record
          </Button>
        </Box>
      )}
    </Stack>
  );
}
