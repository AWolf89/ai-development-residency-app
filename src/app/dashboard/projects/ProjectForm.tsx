"use client";

import { useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
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

export type ProjectFormInitial = {
  projectId: string;
  name: string;
  role: string;
  organisation: string;
  summary: string;
  status: string;
  startedOn: string;
  endedOn: string;
};

/**
 * Create or edit a project. A thin client form over the tested `saveProjectAction`
 * (the server re-validates). With `initial` it edits that project (a hidden
 * `project_id` switches the action to update) and returns to the project on save;
 * without it, it creates and resets for the next one.
 */
export default function ProjectForm({
  initial,
}: {
  initial?: ProjectFormInitial;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const editing = Boolean(initial);

  const [state, formAction, pending] = useActionState<
    ProjectActionState | undefined,
    FormData
  >(async (prev, formData) => {
    const result = await saveProjectAction(prev, formData);
    if (result.ok) {
      if (editing) {
        router.push(`/dashboard/projects/${result.projectId}`);
        router.refresh();
      } else {
        formRef.current?.reset();
      }
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
        {state?.ok && !editing ? (
          <Alert severity="success" role="status">
            Project saved.
          </Alert>
        ) : null}

        {initial ? (
          <input type="hidden" name="project_id" value={initial.projectId} />
        ) : null}

        <TextField
          name="name"
          label="Project name"
          required
          fullWidth
          defaultValue={initial?.name ?? ""}
        />
        <TextField
          name="role"
          label="Your role (optional)"
          fullWidth
          defaultValue={initial?.role ?? ""}
          helperText="e.g. Tech lead, Designer, Volunteer coordinator"
        />
        <TextField
          name="organisation"
          label="Organisation / client (optional)"
          fullWidth
          defaultValue={initial?.organisation ?? ""}
        />
        <TextField
          name="summary"
          label="Summary (optional)"
          fullWidth
          multiline
          minRows={2}
          defaultValue={initial?.summary ?? ""}
        />

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            name="started_on"
            label="Start date (optional)"
            type="date"
            fullWidth
            defaultValue={initial?.startedOn ?? ""}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            name="ended_on"
            label="End date (optional)"
            type="date"
            fullWidth
            defaultValue={initial?.endedOn ?? ""}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>

        <FormControl fullWidth>
          <InputLabel id="project-status-label">Status</InputLabel>
          <Select
            labelId="project-status-label"
            name="status"
            label="Status"
            defaultValue={initial?.status ?? "active"}
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
          {pending ? "Saving…" : editing ? "Save changes" : "Add project"}
        </Button>
      </Stack>
    </Box>
  );
}
