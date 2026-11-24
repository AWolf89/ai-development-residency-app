"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useFormStatus } from "react-dom";
import {
  acceptLearningMomentAction,
  rejectLearningMomentAction,
} from "./actions";

function Actions() {
  const { pending } = useFormStatus();
  return (
    <Stack direction="row" spacing={1.5}>
      <Button
        type="submit"
        formAction={acceptLearningMomentAction}
        variant="contained"
        disabled={pending}
      >
        {pending ? "Saving…" : "Save learning moment"}
      </Button>
      <Button
        type="submit"
        formAction={rejectLearningMomentAction}
        variant="outlined"
        disabled={pending}
      >
        Not this time
      </Button>
    </Stack>
  );
}

/**
 * The second human-in-the-loop gate (ADR-0025). "Save learning moment" is the ONLY control that
 * writes the proposed learning moment — it maps to the `accept` event, the single edge into the
 * FSM's `saving_learning_moment` state. "Not this time" dismisses it. The save never shares a step
 * with the proposal; this component only confirms the suggestion the user already saw.
 */
export default function LearningMomentGate({
  sessionId,
}: {
  sessionId: string;
}) {
  return (
    <Box component="form">
      <input type="hidden" name="session_id" value={sessionId} />
      <Actions />
    </Box>
  );
}
