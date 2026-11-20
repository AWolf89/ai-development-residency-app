"use client";

import { useActionState, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { saveLearningMomentAction } from "./actions";
import { validateLearningMoment } from "@/lib/learning-moments/validation";
import {
  allKindPresentations,
  presentationFor,
} from "@/lib/learning-moments/presentation";
import type { LearningMomentKind } from "@/lib/learning-moments/types";
import { serifStack } from "@/theme-tokens";
import ProjectPicker, { type ProjectOption } from "@/components/ProjectPicker";

export type FileOption = { id: string; file_name: string };
export type RoleOption = { id: string; title: string; company: string | null };

type CaptureFormProps = {
  files: FileOption[];
  roles: RoleOption[];
  projects: ProjectOption[];
};

const KINDS = allKindPresentations();

export default function CaptureForm({
  files,
  roles,
  projects,
}: CaptureFormProps) {
  const [kind, setKind] = useState<LearningMomentKind>("speed");
  const [context, setContext] = useState("");
  const [shift, setShift] = useState("");
  const [result, setResult] = useState("");
  const [duration, setDuration] = useState("");
  const [fileId, setFileId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    saveLearningMomentAction,
    undefined
  );
  const errorRef = useRef<HTMLDivElement>(null);

  const presentation = presentationFor(kind);

  // Reuse the tested pure validator so the client prompt and the server check agree; the
  // server re-validates on submit regardless (AC4).
  function handleSubmit(formData: FormData) {
    const check = validateLearningMoment({
      kind,
      context,
      shift,
      result,
      duration,
      targetRoleId: roleId,
    });
    if (!check.ok) {
      setClientError(check.error);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setClientError(null);
    formAction(formData);
  }

  if (state?.notice) {
    return (
      <Stack spacing={2}>
        <Alert severity="success" role="status">
          {state.notice} Your learning moment is saved to your profile.
        </Alert>
        <Link href="/dashboard">Back to your records</Link>
      </Stack>
    );
  }

  return (
    <Box component="form" action={handleSubmit} sx={{ maxWidth: 620 }}>
      {/* Carry controlled values with the submit so the Server Action receives them. */}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="context" value={context} />
      <input type="hidden" name="shift" value={shift} />
      <input type="hidden" name="result" value={result} />
      <input type="hidden" name="duration" value={duration} />
      <input type="hidden" name="file_id" value={fileId} />
      <input type="hidden" name="target_role_id" value={roleId} />
      <input type="hidden" name="project_id" value={projectId} />

      <Stack spacing={2.5}>
        <FormControl fullWidth>
          <InputLabel id="lm-kind-label">Kind of learning moment</InputLabel>
          <Select
            labelId="lm-kind-label"
            label="Kind of learning moment"
            value={kind}
            onChange={(e) => setKind(e.target.value as LearningMomentKind)}
          >
            {KINDS.map((k) => (
              <MenuItem key={k.kind} value={k.kind}>
                {k.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* The adaptive prompt (AC1 for the speed kind). */}
        <Typography
          component="h2"
          sx={{ fontFamily: serifStack, fontSize: { xs: 22, md: 26 }, m: 0 }}
        >
          {presentation.prompt}
        </Typography>

        {clientError ? (
          <Alert severity="error" role="alert" tabIndex={-1} ref={errorRef}>
            {clientError}
          </Alert>
        ) : null}
        {state?.error ? (
          <Alert severity="error" role="alert">
            {state.error}
          </Alert>
        ) : null}

        <TextField
          label="The situation"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          required
          fullWidth
          multiline
          minRows={2}
          helperText="What you were facing."
        />
        <TextField
          label={presentation.shiftLabel}
          value={shift}
          onChange={(e) => setShift(e.target.value)}
          required
          fullWidth
          multiline
          minRows={2}
        />
        {presentation.showsDuration ? (
          <TextField
            label="How long it took"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            required
            fullWidth
            helperText="e.g. 3 weeks, a weekend, one sprint."
          />
        ) : null}
        <TextField
          label="The result"
          value={result}
          onChange={(e) => setResult(e.target.value)}
          required
          fullWidth
          multiline
          minRows={2}
          helperText="What it enabled or led to."
        />

        {files.length > 0 ? (
          <FormControl fullWidth>
            <InputLabel id="lm-file-label">
              Link a related artifact (optional)
            </InputLabel>
            <Select
              labelId="lm-file-label"
              label="Link a related artifact (optional)"
              value={fileId}
              onChange={(e) => setFileId(e.target.value)}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {files.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.file_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}

        {roles.length > 0 ? (
          <FormControl fullWidth>
            <InputLabel id="lm-role-label">
              Link to a target role (optional)
            </InputLabel>
            <Select
              labelId="lm-role-label"
              label="Link to a target role (optional)"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {roles.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.title}
                  {r.company ? ` · ${r.company}` : ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}

        {projects.length > 0 ? (
          <ProjectPicker
            label="Link to a project (optional)"
            projects={projects}
            value={projectId}
            onChange={setProjectId}
          />
        ) : null}

        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? "Saving…" : "Save learning moment"}
          </Button>
          {/* AC4: skipping saves nothing — just leave the prompt. */}
          <Link href="/dashboard">Skip for now</Link>
        </Stack>
      </Stack>
    </Box>
  );
}
