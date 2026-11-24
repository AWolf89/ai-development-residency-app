"use client";

import { useId, useState, useTransition } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  proposeRecordsAction,
  approveProposalAction,
} from "@/lib/file-analysis/proposal/actions";
import { contributionLabel } from "@/lib/provenance/types";
import type {
  FileProposal,
  ProposalQuestion,
  ProposedProject,
  ProposedRecord,
} from "@/lib/file-analysis/proposal/types";

type Phase = "questions" | "review" | "error";

type Props = {
  fileId: string;
  fileName: string;
  disabled?: boolean;
  onSaved: (summary: {
    fileName: string;
    projectId: string | null;
    records: number;
  }) => void;
  /**
   * An already-computed proposal (from the orchestrator's `advanceRun`), so the dialog can seed its
   * review without running a second `proposeRecordsAction` pass. Optional — existing callers omit
   * it and the dialog fetches its own (MVP 2 Phase 4 flow wizard). Presentation only.
   */
  initialProposal?: FileProposal;
  /** Override the trigger button's text (the flow wizard labels it in context). */
  triggerLabel?: string;
};

/**
 * The "Propose records" affordance for one file (MVP 2 Phase 2). It asks the agent to propose the
 * project and evidence records a file supports, then renders them for the user's HITL decision:
 * the user can edit the project, drop any record, and only an explicit Approve writes anything —
 * mirroring the proposal FSM's HITL guarantee (ADR-0013) at the UI layer. Ambiguous files surface
 * the agent's clarifying questions instead of a guessed project (AC4).
 *
 * Humble Object: no proposal logic lives here — the tested orchestrator does the work server-side;
 * this component only requests a pass and relays the user's decision.
 */
export default function ProposeRecordsDialog({
  fileId,
  fileName,
  disabled,
  onSaved,
  initialProposal,
  triggerLabel,
}: Props) {
  const titleId = useId();

  const [open, setOpen] = useState(false);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [phase, setPhase] = useState<Phase>("review");
  const [error, setError] = useState<string | null>(null);

  const [project, setProject] = useState<ProposedProject | null>(null);
  const [includeProject, setIncludeProject] = useState(true);
  const [records, setRecords] = useState<ProposedRecord[]>([]);
  const [included, setIncluded] = useState<Set<number>>(new Set());
  const [dropped, setDropped] = useState(0);

  const [questions, setQuestions] = useState<ProposalQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [asked, setAsked] = useState<{ question: string; answer: string }[]>(
    []
  );

  const busy = loading || saving;

  function applyProposal(res: {
    project: ProposedProject | null;
    records: ProposedRecord[];
    droppedRecords: number;
  }) {
    setProject(res.project);
    setIncludeProject(res.project !== null);
    setRecords(res.records);
    setIncluded(new Set(res.records.map((_, i) => i)));
    setDropped(res.droppedRecords);
    setPhase("review");
  }

  function runPass(priorAnswers?: { question: string; answer: string }[]) {
    startLoading(async () => {
      const res = await proposeRecordsAction(fileId, priorAnswers);
      if (!res.ok) {
        setError(res.error);
        setPhase("error");
        return;
      }
      setError(null);
      if (res.questions.length > 0) {
        // Keep the partial proposal so "Skip" can proceed with what we have.
        setProject(res.project);
        setRecords(res.records);
        setDropped(res.droppedRecords);
        setQuestions(res.questions);
        setAnswers(res.questions.map(() => ""));
        setPhase("questions");
        return;
      }
      applyProposal(res);
    });
  }

  function openAndPropose() {
    setError(null);
    setProject(null);
    setRecords([]);
    setIncluded(new Set());
    setDropped(0);
    setQuestions([]);
    setAnswers([]);
    setAsked([]);
    setPhase("review");
    setOpen(true);
    // Seed from the orchestrator's already-computed proposal when the flow wizard supplies it, so
    // the propose entry point runs once, not twice. Mirrors runPass's success branch exactly.
    if (initialProposal) {
      if (initialProposal.questions.length > 0) {
        setProject(initialProposal.project);
        setRecords(initialProposal.records);
        setDropped(initialProposal.droppedRecords);
        setQuestions(initialProposal.questions);
        setAnswers(initialProposal.questions.map(() => ""));
        setPhase("questions");
      } else {
        applyProposal(initialProposal);
      }
      return;
    }
    runPass();
  }

  function close() {
    if (busy) return;
    setOpen(false);
  }

  function submitAnswers() {
    const pairs = [
      ...asked,
      ...questions.map((q, i) => ({ question: q.text, answer: answers[i] })),
    ];
    setAsked(pairs);
    runPass(pairs);
  }

  function skipQuestions() {
    applyProposal({ project, records, droppedRecords: dropped });
  }

  function toggleRecord(index: number) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function approve() {
    const chosenProject =
      includeProject && project
        ? { ...project, name: project.name.trim() }
        : null;
    const chosenRecords = records.filter((_, i) => included.has(i));
    setError(null);
    startSaving(async () => {
      const res = await approveProposalAction({
        fileId,
        project: chosenProject,
        records: chosenRecords,
      });
      if (!res.ok) {
        setError(res.error);
        setPhase("error");
        return;
      }
      setOpen(false);
      onSaved({
        fileName,
        projectId: res.result.projectId,
        records: res.result.recordIds.length,
      });
    });
  }

  const nothingSelected = (!includeProject || !project) && included.size === 0;

  return (
    <>
      <Button
        size="small"
        onClick={openAndPropose}
        disabled={disabled}
        aria-label={`Propose records from ${fileName}`}
      >
        {triggerLabel ?? "Propose records"}
      </Button>

      <Dialog
        open={open}
        onClose={close}
        aria-labelledby={titleId}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id={titleId}>
          Propose records from “{fileName}”
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
                Reading this file and drafting a proposal…
              </Typography>
            </Stack>
          ) : saving ? (
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ py: 2, alignItems: "center" }}
            >
              <CircularProgress size={20} aria-hidden="true" />
              <Typography role="status">
                Saving the project and records…
              </Typography>
            </Stack>
          ) : phase === "questions" ? (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                This file isn’t clear enough to propose a project confidently. A
                few answers would help — or skip to review what was found.
              </Typography>
              {questions.map((q, i) => (
                <TextField
                  key={i}
                  label={q.text}
                  value={answers[i]}
                  onChange={(e) =>
                    setAnswers((prev) =>
                      prev.map((a, j) => (j === i ? e.target.value : a))
                    )
                  }
                  fullWidth
                  multiline
                  minRows={1}
                />
              ))}
            </Stack>
          ) : phase === "review" ? (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Nothing is saved until you approve. Edit the project, drop any
                record, then approve.
              </Typography>

              {/* Project */}
              {project ? (
                <Box component="fieldset" sx={{ border: 0, m: 0, p: 0 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={includeProject}
                        onChange={(e) => setIncludeProject(e.target.checked)}
                      />
                    }
                    label={
                      <Typography component="legend" variant="subtitle2">
                        Proposed project
                      </Typography>
                    }
                  />
                  <Stack
                    spacing={1.5}
                    sx={{ pl: 4, opacity: includeProject ? 1 : 0.5 }}
                  >
                    <TextField
                      label="Project name"
                      value={project.name}
                      onChange={(e) =>
                        setProject((p) =>
                          p ? { ...p, name: e.target.value } : p
                        )
                      }
                      disabled={!includeProject}
                      fullWidth
                      size="small"
                    />
                    <TextField
                      label="Organisation (optional)"
                      value={project.organisation ?? ""}
                      onChange={(e) =>
                        setProject((p) =>
                          p ? { ...p, organisation: e.target.value || null } : p
                        )
                      }
                      disabled={!includeProject}
                      fullWidth
                      size="small"
                    />
                  </Stack>
                </Box>
              ) : (
                <Alert severity="info" role="status">
                  No single project was clear from this file, so the records
                  below will be saved without one. You can assign a project
                  later.
                </Alert>
              )}

              <Divider />

              {/* Records */}
              {records.length === 0 ? (
                <Typography variant="body2">
                  No grounded evidence records were found in this file. Nothing
                  will be saved.
                </Typography>
              ) : (
                <Box component="fieldset" sx={{ border: 0, m: 0, p: 0 }}>
                  <Typography
                    component="legend"
                    variant="subtitle2"
                    sx={{ mb: 1 }}
                  >
                    Proposed evidence records — uncheck any that don’t fit.
                  </Typography>
                  <Stack spacing={1}>
                    {records.map((record, i) => (
                      <FormControlLabel
                        key={i}
                        sx={{ alignItems: "flex-start" }}
                        control={
                          <Checkbox
                            checked={included.has(i)}
                            onChange={() => toggleRecord(i)}
                          />
                        }
                        label={
                          <Box sx={{ py: 0.5 }}>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600 }}
                            >
                              {record.title}{" "}
                              <Typography
                                component="span"
                                variant="caption"
                                color="text.secondary"
                              >
                                · {contributionLabel(record.contribution)} ·{" "}
                                {record.confidence} confidence
                              </Typography>
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {record.decision} → {record.outcome}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block", fontStyle: "italic" }}
                            >
                              Cited: {record.location}
                            </Typography>
                          </Box>
                        }
                      />
                    ))}
                  </Stack>
                </Box>
              )}

              {dropped > 0 ? (
                <Typography variant="caption" color="text.secondary">
                  {dropped} suggested record{dropped === 1 ? "" : "s"} had no
                  citation and {dropped === 1 ? "was" : "were"} left out.
                </Typography>
              ) : null}
            </Stack>
          ) : null}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          {busy ? (
            <Button disabled>Working…</Button>
          ) : phase === "questions" ? (
            <>
              <Button onClick={skipQuestions}>Skip</Button>
              <Button
                variant="contained"
                onClick={submitAnswers}
                disabled={answers.every((a) => a.trim() === "")}
              >
                Continue
              </Button>
            </>
          ) : phase === "review" ? (
            <>
              <Button onClick={close}>Reject</Button>
              <Button
                variant="contained"
                onClick={approve}
                disabled={nothingSelected}
              >
                Approve &amp; save
              </Button>
            </>
          ) : (
            <>
              <Button onClick={close}>Close</Button>
              <Button variant="contained" onClick={() => runPass(asked)}>
                Try again
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
