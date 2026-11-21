"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useFormStatus } from "react-dom";
import { startInterviewAction } from "./actions";

type RoleOption = { id: string; title: string; company: string | null };
type ProjectOption = { id: string; name: string };

function StartButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="contained" disabled={pending}>
      {pending ? "Starting…" : "Start interview"}
    </Button>
  );
}

/**
 * Starts a new reasoning interview. A client component for the pending state; the Server Action
 * creates the session and asks the first grounded question (ADR-0013). The title is the project
 * or decision the interview is about; linking a target role is optional. Picking a project turns
 * it into a timeline-anchored Decision-Point Interview (ADR-0021): the agent drafts a timeline
 * from that project's files for you to correct before any question.
 */
export default function StartForm({
  roles,
  projects,
}: {
  roles: RoleOption[];
  projects: ProjectOption[];
}) {
  return (
    <Box component="form" action={startInterviewAction} sx={{ maxWidth: 520 }}>
      <Stack spacing={2}>
        <TextField
          name="title"
          label="What project or decision should we talk about?"
          placeholder="e.g. Billing migration"
          required
          fullWidth
          sx={{ bgcolor: "#fff" }}
        />
        {projects.length > 0 ? (
          <TextField
            name="project_id"
            label="Build from a project's files (optional)"
            helperText="Pick a project and I'll draft a timeline from its files for you to review first."
            select
            defaultValue=""
            fullWidth
            sx={{ bgcolor: "#fff" }}
          >
            <MenuItem value="">No project — just ask me</MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
        {roles.length > 0 ? (
          <TextField
            name="target_role_id"
            label="Link to a target role (optional)"
            select
            defaultValue=""
            fullWidth
            sx={{ bgcolor: "#fff" }}
          >
            <MenuItem value="">None</MenuItem>
            {roles.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.title}
                {r.company ? ` · ${r.company}` : ""}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
        <Box>
          <StartButton />
        </Box>
      </Stack>
    </Box>
  );
}
