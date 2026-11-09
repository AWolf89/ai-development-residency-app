"use client";

import { useActionState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { updateDisplayName } from "@/lib/profile/actions";

type ProfileFormProps = {
  initialDisplayName: string;
};

export default function ProfileForm({ initialDisplayName }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    updateDisplayName,
    undefined
  );

  return (
    <Box component="form" action={formAction}>
      <Stack spacing={2}>
        {state?.error ? <Alert severity="error">{state.error}</Alert> : null}
        {state?.notice ? (
          <Alert severity="success">{state.notice}</Alert>
        ) : null}

        <TextField
          name="display_name"
          label="Display name"
          defaultValue={initialDisplayName}
          fullWidth
        />
        <Button
          type="submit"
          variant="contained"
          disabled={pending}
          sx={{ alignSelf: "flex-start" }}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </Stack>
    </Box>
  );
}
