"use client";

import { useActionState, useRef } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import {
  saveProjectAction,
  type ProjectActionState,
} from "@/lib/projects/actions";

/**
 * Create a project. A thin client form over the tested `saveProjectAction`: the
 * server re-validates, so the native `required` on name is only a first prompt.
 * On success the page revalidates and the new project appears in the list.
 */
export default function ProjectForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<
    ProjectActionState | undefined,
    FormData
  >(async (prev, formData) => {
    const result = await saveProjectAction(prev, formData);
    if (result.ok) {
      formRef.current?.reset();
    }
    return result;
  }, undefined);

  return (
    <Box component="form" action={formAction} ref={formRef}>
      <Stack spacing={2}>
        {state?.error ? (
          <Alert severity="error" role="alert">
            {state.error}
          </Alert>
        ) : null}
        {state?.ok ? (
          <Alert severity="success" role="status">
            Project saved.
          </Alert>
        ) : null}

        <TextField name="name" label="Project name" required fullWidth />
        <TextField
          name="role"
          label="Your role (optional)"
          fullWidth
          helperText="e.g. Tech lead, Designer, Volunteer coordinator"
        />
        <TextField
          name="organisation"
          label="Organisation / client (optional)"
          fullWidth
        />
        <TextField
          name="summary"
          label="Summary (optional)"
          fullWidth
          multiline
          minRows={2}
        />

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            name="started_on"
            label="Start date (optional)"
            type="date"
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            name="ended_on"
            label="End date (optional)"
            type="date"
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>

        <FormControl fullWidth>
          <InputLabel id="project-status-label">Status</InputLabel>
          <Select
            labelId="project-status-label"
            name="status"
            label="Status"
            defaultValue="active"
          >
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="archived">Archived</MenuItem>
          </Select>
        </FormControl>

        <Button
          type="submit"
          variant="contained"
          disabled={pending}
          sx={{ alignSelf: "flex-start" }}
        >
          {pending ? "Saving…" : "Add project"}
        </Button>
      </Stack>
    </Box>
  );
}
