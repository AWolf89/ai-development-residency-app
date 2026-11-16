"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useFormStatus } from "react-dom";
import { brand } from "@/theme-tokens";
import { submitAnswerAction, skipAction, pauseAction } from "./actions";

function Actions() {
  const { pending } = useFormStatus();
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
      <Button
        type="submit"
        formAction={submitAnswerAction}
        variant="contained"
        disabled={pending}
      >
        {pending ? "Working…" : "Send answer"}
      </Button>
      <Button
        type="submit"
        formAction={skipAction}
        variant="outlined"
        disabled={pending}
      >
        Skip question
      </Button>
      <Button
        type="submit"
        formAction={pauseAction}
        variant="text"
        disabled={pending}
        sx={{ color: brand.tag.blue.fg }}
      >
        Pause and save
      </Button>
    </Stack>
  );
}

/**
 * The answer box and its three actions (send / skip / pause). A client component so the
 * buttons can show a pending state; all the work happens server-side in the Server Actions,
 * and the FSM decides what each action does (ADR-0013). The three buttons share one form via
 * per-button `formAction`, so the typed answer travels with "Send answer".
 */
export default function AnswerForm({ sessionId }: { sessionId: string }) {
  return (
    <Box component="form">
      <input type="hidden" name="session_id" value={sessionId} />
      <Stack spacing={2}>
        <TextField
          name="answer"
          multiline
          minRows={4}
          fullWidth
          placeholder="Answer in your own words…"
          aria-label="Your answer"
          sx={{ bgcolor: "#fff" }}
        />
        <Actions />
      </Stack>
    </Box>
  );
}
