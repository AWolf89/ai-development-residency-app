"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useFormStatus } from "react-dom";
import { acceptAction, editAction } from "./actions";

function Actions() {
  const { pending } = useFormStatus();
  return (
    <Stack direction="row" spacing={1.5}>
      <Button
        type="submit"
        formAction={acceptAction}
        variant="contained"
        disabled={pending}
      >
        {pending ? "Saving…" : "Yes, save it"}
      </Button>
      <Button
        type="submit"
        formAction={editAction}
        variant="outlined"
        disabled={pending}
      >
        Fix it
      </Button>
    </Stack>
  );
}

/**
 * The human-in-the-loop save gate (ADR-0013, R1 §3.4). "Yes, save it" is the ONLY control that
 * writes a decision record — it maps to the `accept` event, the single edge into the FSM's
 * `saving` state. "Fix it" re-opens the answer. The side effect never shares a step with the
 * paraphrase; this component only confirms what the user already saw.
 */
export default function PlaybackGate({ sessionId }: { sessionId: string }) {
  return (
    <Box component="form">
      <input type="hidden" name="session_id" value={sessionId} />
      <Actions />
    </Box>
  );
}
