"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { createClient } from "@/lib/supabase/client";
import { recordUploadAction, deleteFileAction } from "@/lib/files/actions";
import {
  validateFileUpload,
  buildStoragePath,
  inferMimeType,
} from "@/lib/files/validation";
import type { FileView } from "@/lib/files/mappers";

const BUCKET = "user-files";

// Hint for the native picker; the tested validator is the real gate.
const ACCEPT = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".txt",
  ".md",
  ".docx",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");

type FilesManagerProps = {
  userId: string;
  files: FileView[];
};

export default function FilesManager({ userId, files }: FilesManagerProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FileView | null>(null);
  const [deleting, setDeleting] = useState(false);

  function resetInput() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError(null);
    setNotice(null);

    const mimeType = inferMimeType(file.name, file.type);
    // Same tested validator the server re-runs, so the prompt matches the gate.
    const check = validateFileUpload({
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
    });
    if (!check.ok) {
      setError(check.error);
      resetInput();
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const storagePath = buildStoragePath(
        userId,
        file.name,
        crypto.randomUUID()
      );

      // Upload bytes straight to Storage (RLS confines this to the user's own
      // folder), avoiding the serverless request-body cap.
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: mimeType, upsert: false });
      if (uploadError) {
        setError("Upload failed. Please try again.");
        return;
      }

      // Record the metadata row (the action re-validates and cleans up on error).
      const result = await recordUploadAction({
        storagePath,
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
      });
      if (result.error) {
        setError(result.error);
        return;
      }

      setNotice(`Uploaded “${file.name}”.`);
      router.refresh();
    } finally {
      setUploading(false);
      resetInput();
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) {
      return;
    }
    setDeleting(true);
    setError(null);
    setNotice(null);

    const result = await deleteFileAction(deleteTarget.id);

    setDeleting(false);
    const name = deleteTarget.name;
    setDeleteTarget(null);

    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice(`Deleted “${name}”.`);
    router.refresh();
  }

  return (
    <Stack spacing={3}>
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

      <Box>
        <Button variant="contained" component="label" disabled={uploading}>
          {uploading ? "Uploading…" : "Choose a file"}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            hidden
            aria-label="Choose a file to upload"
            onChange={handleFileChange}
          />
        </Button>
      </Box>

      <Stack spacing={1.5}>
        <Typography variant="h6" component="h2">
          Your files
        </Typography>

        {files.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No files yet. Choose a file above to upload your first piece of
            evidence.
          </Typography>
        ) : (
          <Stack
            spacing={1.5}
            component="ul"
            sx={{ listStyle: "none", m: 0, p: 0 }}
          >
            {files.map((file) => (
              <Box component="li" key={file.id}>
                <Card variant="outlined">
                  <CardContent
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="subtitle1"
                        component="h3"
                        sx={{ wordBreak: "break-word" }}
                      >
                        {file.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {file.sizeLabel} · Uploaded{" "}
                        {new Date(file.createdAt).toLocaleDateString()}
                      </Typography>
                    </Box>
                    <IconButton
                      aria-label={`Delete ${file.name}`}
                      onClick={() => setDeleteTarget(file)}
                      disabled={uploading}
                    >
                      <DeleteOutlineIcon />
                    </IconButton>
                  </CardContent>
                </Card>
              </Box>
            ))}
          </Stack>
        )}
      </Stack>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => (deleting ? null : setDeleteTarget(null))}
        aria-labelledby="delete-file-title"
      >
        <DialogTitle id="delete-file-title">Delete this file?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            “{deleteTarget?.name}” will be permanently removed. This cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button onClick={confirmDelete} color="error" disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
