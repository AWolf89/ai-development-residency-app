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
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { analyzeFileAction, saveFileTagsAction } from "@/lib/file-analysis/actions";
import type { ClarifyingQuestion, ProposedTag } from "@/lib/file-analysis/types";

type Phase = "questions" | "review" | "error";

type Props = {
  fileId: string;
  fileName: string;
  disabled?: boolean;
  onSaved: (fileName: string) => void;
};

/**
 * The "Analyze" affordance for one file (ADR-0020). It drives the grounded analysis through its
 * Server Actions and renders the proposal in an accessible modal for the user's HITL decision: it
 * proposes tags, asks a few targeted questions when the file is ambiguous (never guessing), and
 * only saves on an explicit Accept — mirroring the FSM's HITL guarantee at the UI layer.
 *
 * Humble Object: no analysis logic lives here — the tested orchestrator does the work server-side;
 * this component only requests a pass and relays the user's decision. The async work runs in a
 * transition from an event handler (never a layout effect).
 */
export default function FileAnalyzeDialog({
  fileId,
  fileName,
  disabled,
  onSaved,
}: Props) {
  const titleId = useId();

  const [open, setOpen] = useState(false);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [phase, setPhase] = useState<Phase>("review"); // meaningful only when not loading
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState<ProposedTag[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [asked, setAsked] = useState<{ question: string; answer: string }[]>([]);

  const busy = loading || saving;

  function runPass(priorAnswers?: { question: string; answer: string }[]) {
    startLoading(async () => {
      const res = await analyzeFileAction(fileId, priorAnswers);
      if (!res.ok) {
        setError(res.error);
        setPhase("error");
        return;
      }
      setError(null);
      setSummary(res.summary);
      if (res.questions.length > 0) {
        setQuestions(res.questions);
        setAnswers(res.questions.map(() => ""));
        setPhase("questions");
        return;
      }
      setTags(res.tags);
      setSelected(new Set(res.tags.map((t) => t.referenceItemId)));
      setPhase("review");
    });
  }

  function openAndAnalyze() {
    setError(null);
    setSummary("");
    setTags([]);
    setSelected(new Set());
    setQuestions([]);
    setAnswers([]);
    setAsked([]);
    setPhase("review");
    setOpen(true);
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

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function accept() {
    const chosen = tags.filter((t) => selected.has(t.referenceItemId));
    setError(null);
    startSaving(async () => {
      const res = await saveFileTagsAction({ fileId, summary, tags: chosen });
      if (!res.ok) {
        setError(res.error);
        setPhase("error");
        return;
      }
      setOpen(false);
      onSaved(fileName);
    });
  }

  return (
    <>
      <Button
        size="small"
        onClick={openAndAnalyze}
        disabled={disabled}
        aria-label={`Analyze ${fileName}`}
      >
        Analyze
      </Button>

      <Dialog
        open={open}
        onClose={close}
        aria-labelledby={titleId}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id={titleId}>Analyze “{fileName}”</DialogTitle>
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
                Reading and analyzing this file…
              </Typography>
            </Stack>
          ) : saving ? (
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ py: 2, alignItems: "center" }}
            >
              <CircularProgress size={20} aria-hidden="true" />
              <Typography role="status">Saving tags…</Typography>
            </Stack>
          ) : phase === "questions" ? (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                A few quick questions so the tags are accurate — rather than
                guess.
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
              {summary ? (
                <Typography variant="body2" color="text.secondary">
                  {summary}
                </Typography>
              ) : null}
              {tags.length === 0 ? (
                <Typography variant="body2">
                  No confident tags were found for this file. Nothing will be
                  saved.
                </Typography>
              ) : (
                <Box component="fieldset" sx={{ border: 0, m: 0, p: 0 }}>
                  <Typography
                    component="legend"
                    variant="subtitle2"
                    sx={{ mb: 1 }}
                  >
                    Proposed tags — uncheck any that don’t fit, then Accept.
                  </Typography>
                  <Stack spacing={0.5}>
                    {tags.map((tag) => (
                      <FormControlLabel
                        key={tag.referenceItemId}
                        control={
                          <Checkbox
                            checked={selected.has(tag.referenceItemId)}
                            onChange={() => toggle(tag.referenceItemId)}
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2">
                              {tag.name}{" "}
                              <Typography
                                component="span"
                                variant="caption"
                                color="text.secondary"
                              >
                                · {tag.entityType} · {tag.confidence} confidence
                              </Typography>
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {tag.rationale}
                            </Typography>
                          </Box>
                        }
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          ) : null}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          {busy ? (
            <Button disabled>Working…</Button>
          ) : phase === "questions" ? (
            <>
              <Button onClick={close}>Cancel</Button>
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
                onClick={accept}
                disabled={selected.size === 0}
              >
                Accept
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
