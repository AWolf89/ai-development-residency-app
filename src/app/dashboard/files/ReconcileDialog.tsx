"use client";

import { useId, useState, useTransition } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import {
  reconcileFileAction,
  saveReconciliationFlagsAction,
} from "@/lib/file-analysis/reconciliation/actions";
import type {
  ReconciliationDisposition,
  ReconciliationFlag,
  ReconciliationKind,
} from "@/lib/file-analysis/reconciliation/types";

type Phase = "review" | "empty" | "error";

type Props = {
  fileId: string;
  fileName: string;
  disabled?: boolean;
  onSaved: (summary: { fileName: string; saved: number }) => void;
};

const KIND_LABEL: Record<ReconciliationKind, string> = {
  date: "Date conflict",
  metric: "Metric conflict",
  ownership: "Ownership conflict",
  complementary: "Complementary",
};

/**
 * The "Check for conflicts" affordance for one file (MVP 2 Phase 2, ADR-0023). It compares the
 * file against the user's existing evidence and surfaces contradictions (date/metric/ownership,
 * both sources cited) and complementary matches. The user keeps or dismisses each; only an
 * explicit Save persists the decisions — nothing is written at ingest (HITL, ADR-0013). The agent
 * never resolves a conflict: it presents both sides and asks.
 */
export default function ReconcileDialog({
  fileId,
  fileName,
  disabled,
  onSaved,
}: Props) {
  const titleId = useId();

  const [open, setOpen] = useState(false);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [phase, setPhase] = useState<Phase>("review");
  const [error, setError] = useState<string | null>(null);
  const [flags, setFlags] = useState<ReconciliationFlag[]>([]);
  const [dropped, setDropped] = useState(0);

  const busy = loading || saving;

  function openAndReconcile() {
    setError(null);
    setFlags([]);
    setDropped(0);
    setPhase("review");
    setOpen(true);
    startLoading(async () => {
      const res = await reconcileFileAction(fileId);
      if (!res.ok) {
        setError(res.error);
        setPhase("error");
        return;
      }
      setFlags(res.flags);
      setDropped(res.dropped);
      setPhase(res.flags.length === 0 ? "empty" : "review");
    });
  }

  function close() {
    if (busy) return;
    setOpen(false);
  }

  function setDisposition(index: number, value: ReconciliationDisposition) {
    setFlags((prev) =>
      prev.map((f, i) => (i === index ? { ...f, disposition: value } : f))
    );
  }

  function save() {
    setError(null);
    startSaving(async () => {
      const res = await saveReconciliationFlagsAction({ fileId, flags });
      if (!res.ok) {
        setError(res.error);
        setPhase("error");
        return;
      }
      setOpen(false);
      onSaved({ fileName, saved: res.saved });
    });
  }

  const decidedCount = flags.filter((f) => f.disposition !== "pending").length;

  return (
    <>
      <Button
        size="small"
        onClick={openAndReconcile}
        disabled={disabled}
        aria-label={`Check ${fileName} for conflicts with your evidence`}
      >
        Check for conflicts
      </Button>

      <Dialog
        open={open}
        onClose={close}
        aria-labelledby={titleId}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id={titleId}>
          Check “{fileName}” against your evidence
        </DialogTitle>
        <DialogContent dividers>
          {error ? (
            <Alert severity="error" role="alert" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}

          {loading ? (
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ py: 2, alignItems: "center" }}
            >
              <CircularProgress size={20} aria-hidden="true" />
              <Typography role="status">
                Comparing this file with your existing evidence…
              </Typography>
            </Stack>
          ) : saving ? (
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ py: 2, alignItems: "center" }}
            >
              <CircularProgress size={20} aria-hidden="true" />
              <Typography role="status">Saving your decisions…</Typography>
            </Stack>
          ) : phase === "empty" ? (
            <Typography variant="body2" role="status">
              No conflicts or overlaps were found between this file and your
              existing evidence.
            </Typography>
          ) : phase === "review" ? (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                These are shown so you can decide — nothing is changed in your
                existing records, and nothing is saved until you choose.
              </Typography>
              {flags.map((flag, i) => (
                <Box
                  key={i}
                  sx={{
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    p: 1.5,
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", mb: 0.5 }}
                  >
                    <Chip
                      size="small"
                      label={KIND_LABEL[flag.kind]}
                      color={
                        flag.kind === "complementary" ? "default" : "warning"
                      }
                    />
                  </Stack>
                  <Typography variant="body2">{flag.message}</Typography>
                  {flag.newValue || flag.existingValue ? (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      This file: {flag.newValue ?? "—"} · Existing:{" "}
                      {flag.existingValue ?? "—"}
                    </Typography>
                  ) : null}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", fontStyle: "italic", mb: 1 }}
                  >
                    Compared with:{" "}
                    {flag.citations.map((c) => c.title).join(", ")}
                  </Typography>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={flag.disposition}
                    onChange={(_, v) => {
                      if (v) setDisposition(i, v as ReconciliationDisposition);
                    }}
                    aria-label={`Decision for: ${flag.message}`}
                  >
                    <ToggleButton value="accepted">
                      {flag.kind === "complementary"
                        ? "Link"
                        : "Keep as conflict"}
                    </ToggleButton>
                    <ToggleButton value="dismissed">
                      Not a conflict
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              ))}
              {dropped > 0 ? (
                <Typography variant="caption" color="text.secondary">
                  {dropped} suggested flag{dropped === 1 ? "" : "s"} couldn’t be
                  grounded in your evidence and {dropped === 1 ? "was" : "were"}{" "}
                  left out.
                </Typography>
              ) : null}
            </Stack>
          ) : null}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          {busy ? (
            <Button disabled>Working…</Button>
          ) : phase === "review" ? (
            <>
              <Button onClick={close}>Cancel</Button>
              <Button
                variant="contained"
                onClick={save}
                disabled={decidedCount === 0}
              >
                Save decisions
              </Button>
            </>
          ) : (
            <Button onClick={close}>Close</Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
