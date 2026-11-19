"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import StatusChip from "@/components/StatusChip";
import { verdictToBucket } from "@/lib/gap/presentation";
import { MODEL_VERDICTS, type ModelVerdict } from "@/lib/gap/types";
import {
  startInvestigationAction,
  acceptFindingAction,
  rejectFindingAction,
} from "@/lib/investigation/actions";
import type { Finding } from "@/lib/investigation/types";
import { brand } from "@/theme-tokens";

const VERDICT_LABEL: Record<ModelVerdict, string> = {
  met: "Met",
  partial: "Partial",
  gap: "Gap",
};

const CONFIDENCE_LABEL = {
  low: "Low",
  medium: "Medium",
  high: "High",
} as const;

/**
 * The "Investigate" affordance for one gap/unknown/partial requirement on the Gap Check
 * screen (EIA 6, ADR-0017). It drives the Evidence Investigation Agent through its Server
 * Actions and renders the proposed finding in an accessible modal for the user's HITL
 * decision: accept (persist), edit-then-accept, or reject (leave the assessment unchanged).
 *
 * Humble Object: no investigation logic lives here — the tested orchestrator does all the
 * work server-side; this component only requests a finding and relays the user's decision.
 */
export default function InvestigateDialog({
  requirement,
  targetRoleId,
}: {
  requirement: { id: string; text: string };
  targetRoleId: string;
}) {
  const router = useRouter();
  const titleId = useId();
  const descId = useId();

  const [open, setOpen] = useState(false);
  const [loading, startLoading] = useTransition();
  const [acting, startActing] = useTransition();
  // null while loading or when the agent could not produce a finding (paused / breaker).
  const [finding, setFinding] = useState<Finding | null>(null);
  const [noFinding, setNoFinding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVerdict, setEditVerdict] = useState<ModelVerdict>("gap");
  const [editRationale, setEditRationale] = useState("");
  const [error, setError] = useState<string | null>(null);

  const busy = loading || acting;

  function resetAndOpen() {
    setFinding(null);
    setNoFinding(false);
    setEditing(false);
    setError(null);
    setOpen(true);
    startLoading(async () => {
      try {
        const result = await startInvestigationAction({ requirement });
        if (result.finding) {
          setFinding(result.finding);
        } else {
          setNoFinding(true);
        }
      } catch {
        setError("Something went wrong starting the investigation.");
      }
    });
  }

  function close() {
    if (busy) return;
    setOpen(false);
  }

  function beginEdit() {
    if (!finding) return;
    setEditVerdict(finding.verdict);
    setEditRationale(finding.rationale);
    setEditing(true);
  }

  function accept(next: Finding) {
    setError(null);
    startActing(async () => {
      try {
        await acceptFindingAction({ requirement, targetRoleId, finding: next });
        setOpen(false);
        setEditing(false);
        router.refresh();
      } catch {
        setError("Couldn't save the finding. Please try again.");
      }
    });
  }

  function reject() {
    if (!finding) {
      setOpen(false);
      return;
    }
    setError(null);
    startActing(async () => {
      try {
        await rejectFindingAction({ requirement, finding });
        setOpen(false);
      } catch {
        setError("Couldn't complete that action. Please try again.");
      }
    });
  }

  const bucket = finding ? verdictToBucket(finding.verdict) : null;

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        onClick={resetAndOpen}
        aria-label={`Investigate: ${requirement.text}`}
      >
        Investigate
      </Button>

      <Dialog
        open={open}
        onClose={close}
        aria-labelledby={titleId}
        aria-describedby={descId}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id={titleId} sx={{ pr: 6 }}>
          Investigate this requirement
        </DialogTitle>

        <DialogContent dividers>
          <Typography
            id={descId}
            variant="body2"
            sx={{ fontWeight: 600, mb: 2 }}
          >
            {requirement.text}
          </Typography>

          {loading ? (
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: "center", py: 2 }}
            >
              <CircularProgress size={20} aria-hidden="true" />
              <Typography variant="body2" color="text.secondary">
                Searching your evidence…
              </Typography>
            </Stack>
          ) : null}

          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}

          {noFinding && !loading ? (
            <Typography variant="body2" color="text.secondary">
              The investigation couldn&apos;t be completed right now. Your
              assessment is unchanged — please try again later.
            </Typography>
          ) : null}

          {finding && !loading ? (
            <Stack spacing={2}>
              {editing ? (
                <>
                  <FormControl fullWidth>
                    <InputLabel id={`${titleId}-verdict`}>Verdict</InputLabel>
                    <Select
                      labelId={`${titleId}-verdict`}
                      label="Verdict"
                      value={editVerdict}
                      onChange={(e) =>
                        setEditVerdict(e.target.value as ModelVerdict)
                      }
                    >
                      {MODEL_VERDICTS.map((v) => (
                        <MenuItem key={v} value={v}>
                          {VERDICT_LABEL[v]}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    label="Rationale"
                    value={editRationale}
                    onChange={(e) => setEditRationale(e.target.value)}
                    multiline
                    minRows={3}
                    fullWidth
                  />
                </>
              ) : (
                <>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      component="div"
                      sx={{ mb: 0.5 }}
                    >
                      Proposed verdict
                    </Typography>
                    {bucket ? (
                      <StatusChip label={bucket.label} tone={bucket.tone} />
                    ) : null}
                  </Box>

                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      component="div"
                      sx={{ mb: 0.5 }}
                    >
                      Rationale
                    </Typography>
                    <Typography variant="body2">{finding.rationale}</Typography>
                  </Box>

                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      component="div"
                      sx={{ mb: 0.5 }}
                    >
                      Supporting evidence
                    </Typography>
                    {finding.citations.length > 0 ? (
                      <Stack
                        component="ul"
                        spacing={0.5}
                        sx={{ m: 0, pl: 2.5 }}
                      >
                        {finding.citations.map((c) => (
                          <Typography
                            key={`${c.source}:${c.id}`}
                            component="li"
                            variant="body2"
                          >
                            {c.title}{" "}
                            <Typography
                              component="span"
                              variant="caption"
                              color="text.secondary"
                            >
                              ({c.source})
                            </Typography>
                          </Typography>
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No supporting evidence was found.
                      </Typography>
                    )}
                  </Box>

                  <Typography variant="caption" color="text.secondary">
                    Confidence: {CONFIDENCE_LABEL[finding.confidence]} ·{" "}
                    {finding.searchCount} search
                    {finding.searchCount === 1 ? "" : "es"} run
                  </Typography>
                </>
              )}
            </Stack>
          ) : null}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          {finding && !loading ? (
            editing ? (
              <>
                <Button
                  onClick={() => setEditing(false)}
                  disabled={busy}
                  variant="text"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() =>
                    accept({
                      ...finding,
                      verdict: editVerdict,
                      rationale: editRationale.trim() || finding.rationale,
                    })
                  }
                  disabled={busy}
                  variant="contained"
                >
                  {acting ? "Saving…" : "Save & accept"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={reject}
                  disabled={busy}
                  variant="text"
                  sx={{ color: brand.tag.gray.fg, mr: "auto" }}
                >
                  Reject
                </Button>
                <Button onClick={beginEdit} disabled={busy} variant="outlined">
                  Edit
                </Button>
                <Button
                  onClick={() => accept(finding)}
                  disabled={busy}
                  variant="contained"
                >
                  {acting ? "Saving…" : "Accept"}
                </Button>
              </>
            )
          ) : (
            <Button onClick={close} disabled={busy} variant="text">
              Close
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
