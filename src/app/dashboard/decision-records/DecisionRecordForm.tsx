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
import { saveDecisionRecordAction } from "@/lib/decision-records/actions";
import {
  validateDecisionRecord,
  DECISION_SOURCES,
  type DecisionSource,
} from "@/lib/decision-records/validation";
import type { UserFile } from "@/lib/decision-records/queries";

export type DecisionRecordFormValues = {
  recordId?: string;
  title: string;
  situation: string;
  cue: string;
  decision: string;
  why: string;
  outcome: string;
  source: DecisionSource | "";
  fileId: string;
};

type DecisionRecordFormProps = {
  files: UserFile[];
  initialValues?: Partial<DecisionRecordFormValues>;
};

const SOURCE_LABELS: Record<DecisionSource, string> = {
  artifact: "From an uploaded artifact",
  self_reported: "Self-reported",
};

const EMPTY: DecisionRecordFormValues = {
  title: "",
  situation: "",
  cue: "",
  decision: "",
  why: "",
  outcome: "",
  source: "",
  fileId: "",
};

export default function DecisionRecordForm({
  files,
  initialValues,
}: DecisionRecordFormProps) {
  const [values, setValues] = useState<DecisionRecordFormValues>({
    ...EMPTY,
    ...initialValues,
  });
  const [step, setStep] = useState<"fill" | "review">("fill");
  const [clientError, setClientError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    saveDecisionRecordAction,
    undefined
  );
  const errorRef = useRef<HTMLDivElement>(null);

  const set =
    (key: keyof DecisionRecordFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: event.target.value }));

  // Reuse the tested pure validator so the client prompt (AC6) and the server
  // check give the same result; the server re-validates on submit regardless.
  function goToReview() {
    const result = validateDecisionRecord({
      title: values.title,
      situation: values.situation,
      cue: values.cue,
      decision: values.decision,
      why: values.why,
      outcome: values.outcome,
      source: values.source,
    });
    if (!result.ok) {
      setClientError(result.error);
      // Move focus to the message so screen-reader users hear it.
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setClientError(null);
    setStep("review");
  }

  if (state?.notice) {
    return (
      <Stack spacing={2}>
        <Alert severity="success" role="status">
          {state.notice} Your record is saved to your profile.
        </Alert>
        <Link href="/dashboard">Back to your records</Link>
      </Stack>
    );
  }

  const reviewRows: Array<{ label: string; value: string }> = [
    { label: "Title", value: values.title },
    { label: "Situation", value: values.situation },
    { label: "Cue", value: values.cue || "—" },
    { label: "Decision", value: values.decision },
    { label: "Why", value: values.why || "—" },
    { label: "Outcome", value: values.outcome },
    {
      label: "Source",
      value: values.source ? SOURCE_LABELS[values.source] : "—",
    },
    {
      label: "Supporting artifact",
      value: files.find((f) => f.id === values.fileId)?.file_name ?? "None",
    },
  ];

  return (
    <Box component="form" action={formAction}>
      {/* Carry every value with the submit, including while showing the review. */}
      {values.recordId ? (
        <input type="hidden" name="record_id" value={values.recordId} />
      ) : null}
      <input type="hidden" name="title" value={values.title} />
      <input type="hidden" name="situation" value={values.situation} />
      <input type="hidden" name="cue" value={values.cue} />
      <input type="hidden" name="decision" value={values.decision} />
      <input type="hidden" name="why" value={values.why} />
      <input type="hidden" name="outcome" value={values.outcome} />
      <input type="hidden" name="source" value={values.source} />
      <input type="hidden" name="file_id" value={values.fileId} />

      {state?.error ? (
        <Alert severity="error" role="alert" sx={{ mb: 2 }}>
          {state.error}
        </Alert>
      ) : null}

      {step === "fill" ? (
        <Stack spacing={2}>
          {clientError ? (
            <Alert severity="error" role="alert" tabIndex={-1} ref={errorRef}>
              {clientError}
            </Alert>
          ) : null}

          <TextField
            label="Title"
            value={values.title}
            onChange={set("title")}
            required
            fullWidth
          />
          <TextField
            label="Situation"
            value={values.situation}
            onChange={set("situation")}
            required
            fullWidth
            multiline
            minRows={2}
            helperText="The context the decision was made in."
          />
          <TextField
            label="Cue"
            value={values.cue}
            onChange={set("cue")}
            fullWidth
            multiline
            minRows={2}
            helperText="What you noticed that prompted the decision. Optional, recommended."
          />
          <TextField
            label="Decision"
            value={values.decision}
            onChange={set("decision")}
            required
            fullWidth
            multiline
            minRows={2}
            helperText="The decision you made."
          />
          <TextField
            label="Why"
            value={values.why}
            onChange={set("why")}
            fullWidth
            multiline
            minRows={2}
            helperText="Your reasoning. Optional, recommended."
          />
          <TextField
            label="Outcome"
            value={values.outcome}
            onChange={set("outcome")}
            required
            fullWidth
            multiline
            minRows={2}
            helperText="What resulted from the decision."
          />

          <FormControl fullWidth required>
            <InputLabel id="dr-source-label">Source</InputLabel>
            <Select
              labelId="dr-source-label"
              label="Source"
              value={values.source}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  source: e.target.value as DecisionSource,
                }))
              }
            >
              {DECISION_SOURCES.map((s) => (
                <MenuItem key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel id="dr-file-label">
              Supporting artifact (optional)
            </InputLabel>
            <Select
              labelId="dr-file-label"
              label="Supporting artifact (optional)"
              value={values.fileId}
              onChange={(e) =>
                setValues((v) => ({ ...v, fileId: e.target.value }))
              }
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

          <Button
            type="button"
            variant="contained"
            onClick={goToReview}
            sx={{ alignSelf: "flex-start" }}
          >
            Review
          </Button>
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Typography variant="h6" component="h3">
            Review before saving
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Nothing is saved until you confirm.
          </Typography>

          <Box
            component="dl"
            sx={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: 1,
              m: 0,
            }}
          >
            {reviewRows.map((row) => (
              <Box key={row.label} sx={{ display: "contents" }}>
                <Typography component="dt" sx={{ fontWeight: 600 }}>
                  {row.label}
                </Typography>
                <Typography
                  component="dd"
                  sx={{ m: 0, whiteSpace: "pre-wrap" }}
                >
                  {row.value}
                </Typography>
              </Box>
            ))}
          </Box>

          <Stack direction="row" spacing={2}>
            <Button
              type="button"
              variant="outlined"
              onClick={() => setStep("fill")}
              disabled={pending}
            >
              Back to edit
            </Button>
            <Button type="submit" variant="contained" disabled={pending}>
              {pending ? "Saving…" : "Confirm & save"}
            </Button>
          </Stack>
        </Stack>
      )}
    </Box>
  );
}
