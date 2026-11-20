"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import ProjectPicker, { type ProjectOption } from "@/components/ProjectPicker";
import { FILE_CAPTION_MAX } from "@/lib/files/validation";
import {
  setFileCaptionAction,
  setFileProjectAction,
  attachRecordToFileAction,
  detachRecordFromFileAction,
} from "@/lib/files/actions";

type LinkedRecord = { linkId: string; recordId: string; title: string };
type RecordOption = { id: string; title: string };

export default function FileHubPanel({
  fileId,
  initialCaption,
  initialProjectId,
  projects,
  linkedRecords,
  records,
}: {
  fileId: string;
  initialCaption: string;
  initialProjectId: string;
  projects: ProjectOption[];
  linkedRecords: LinkedRecord[];
  records: RecordOption[];
}) {
  const router = useRouter();
  const [caption, setCaption] = useState(initialCaption);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [recordToAdd, setRecordToAdd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const linkedIds = new Set(linkedRecords.map((r) => r.recordId));
  const attachable = records.filter((r) => !linkedIds.has(r.id));

  function report(result: { error?: string; notice?: string }) {
    if (result.error) {
      setError(result.error);
      setNotice(null);
    } else {
      setNotice(result.notice ?? "Saved.");
      setError(null);
      router.refresh();
    }
  }

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  async function saveCaption() {
    report(await run(() => setFileCaptionAction(fileId, caption)));
  }

  async function changeProject(next: string) {
    setProjectId(next);
    report(await run(() => setFileProjectAction(fileId, next || null)));
  }

  async function attach() {
    if (!recordToAdd) return;
    const result = await run(() =>
      attachRecordToFileAction(fileId, recordToAdd)
    );
    setRecordToAdd("");
    report(result);
  }

  async function detach(linkId: string) {
    report(await run(() => detachRecordFromFileAction(fileId, linkId)));
  }

  return (
    <Stack spacing={4}>
      {error ? (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert severity="success" role="status">
          {notice}
        </Alert>
      ) : null}

      <Stack spacing={1.5}>
        <Typography variant="h6" component="h2">
          About this file
        </Typography>
        <TextField
          label="Caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          fullWidth
          multiline
          minRows={2}
          helperText={`A one-line note on what this deliverable is (max ${FILE_CAPTION_MAX} characters).`}
          slotProps={{ htmlInput: { maxLength: FILE_CAPTION_MAX } }}
        />
        <Button
          variant="contained"
          onClick={saveCaption}
          disabled={busy}
          sx={{ alignSelf: "flex-start" }}
        >
          Save caption
        </Button>
      </Stack>

      <Stack spacing={1.5}>
        <Typography variant="h6" component="h2">
          Project
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Group this file under a project you worked on.
        </Typography>
        <ProjectPicker
          projects={projects}
          value={projectId}
          onChange={changeProject}
          disabled={busy}
        />
      </Stack>

      <Stack spacing={1.5}>
        <Typography variant="h6" component="h2">
          Decision records this file supports
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The role, context, and decisions behind this file live in decision
          records — attach the ones it backs up.
        </Typography>

        {linkedRecords.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No records linked yet.
          </Typography>
        ) : (
          <Stack component="ul" spacing={0.5} sx={{ listStyle: "none", m: 0, p: 0 }}>
            {linkedRecords.map((r) => (
              <Stack
                key={r.linkId}
                component="li"
                direction="row"
                sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}
              >
                <Typography variant="body2">{r.title}</Typography>
                <IconButton
                  aria-label={`Unlink ${r.title}`}
                  size="small"
                  onClick={() => detach(r.linkId)}
                  disabled={busy}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        )}

        {attachable.length > 0 ? (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel id="attach-record-label">Add a record</InputLabel>
              <Select
                labelId="attach-record-label"
                label="Add a record"
                value={recordToAdd}
                onChange={(e) => setRecordToAdd(e.target.value)}
                disabled={busy}
              >
                {attachable.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              onClick={attach}
              disabled={busy || !recordToAdd}
            >
              Attach
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </Stack>
  );
}
