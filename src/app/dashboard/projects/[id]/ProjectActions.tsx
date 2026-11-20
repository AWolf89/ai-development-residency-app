"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import { deleteProjectAction } from "@/lib/projects/actions";

/**
 * Delete a project after an explicit confirm. Deleting a project only *detaches*
 * its files, records, and moments (they remain, unassigned) — the dialog says so.
 */
export default function ProjectActions({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteProjectAction(projectId);
    if (result.error) {
      setError(result.error);
      setDeleting(false);
      return;
    }
    router.push("/dashboard/projects");
    router.refresh();
  }

  return (
    <>
      <Stack direction="row" spacing={1.5}>
        <Button
          variant="outlined"
          href={`/dashboard/projects/${projectId}/edit`}
        >
          Edit
        </Button>
        <Button color="error" variant="outlined" onClick={() => setOpen(true)}>
          Delete project
        </Button>
      </Stack>

      <Dialog
        open={open}
        onClose={() => (deleting ? null : setOpen(false))}
        aria-labelledby="delete-project-title"
      >
        <DialogTitle id="delete-project-title">
          Delete this project?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            The project will be removed. Your files, decision records, and
            learning moments are <strong>not</strong> deleted — they are just
            unassigned from this project.
          </DialogContentText>
          {error ? (
            <Alert severity="error" role="alert" sx={{ mt: 2 }}>
              {error}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button onClick={confirmDelete} color="error" disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
