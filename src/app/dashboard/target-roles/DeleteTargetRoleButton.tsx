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
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { deleteTargetRoleAction } from "@/lib/target-roles/actions";

type DeleteTargetRoleButtonProps = {
  roleId: string;
  roleTitle: string;
};

/**
 * Destructive action is gated behind an explicit confirm dialog (HITL): the
 * button only opens the dialog; the delete runs on the dialog's Delete button.
 * On success we leave the (now-gone) edit page for the dashboard.
 */
export default function DeleteTargetRoleButton({
  roleId,
  roleTitle,
}: DeleteTargetRoleButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete(): Promise<void> {
    setDeleting(true);
    setError(null);
    const result = await deleteTargetRoleAction(roleId);
    if (result.error) {
      setError(result.error);
      setDeleting(false);
      return;
    }
    setOpen(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <>
      <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
        {error ? (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        ) : null}
        <Button
          type="button"
          color="error"
          variant="outlined"
          startIcon={<DeleteOutlineIcon />}
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          Delete target role
        </Button>
      </Stack>

      <Dialog
        open={open}
        onClose={() => (deleting ? null : setOpen(false))}
        aria-labelledby="delete-target-role-title"
      >
        <DialogTitle id="delete-target-role-title">
          Delete this target role?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            “{roleTitle}” and its requirements will be permanently removed. This
            cannot be undone.
          </DialogContentText>
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
