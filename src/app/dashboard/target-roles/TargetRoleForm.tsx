"use client";

import { useActionState, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import {
  saveTargetRoleAction,
  suggestOccupationsAction,
  deriveOccupationRequirementsAction,
} from "@/lib/target-roles/actions";
import { extractRequirements } from "@/lib/target-roles/extract";
import {
  validateJobDescription,
  validateTargetRoleIntake,
  validateTargetRoleFromTitle,
} from "@/lib/target-roles/validation";
import type { OccupationSuggestion } from "@/lib/target-roles/occupation";

export type TargetRoleFormValues = {
  recordId?: string;
  title: string;
  jobDescription: string;
  requirements: string[];
};

type TargetRoleFormProps = {
  initialValues?: Partial<TargetRoleFormValues>;
};

type Mode = "title" | "jd";
type Row = { key: number; text: string };

let keyCounter = 0;
const toRows = (texts: string[]): Row[] =>
  texts.map((text) => ({ key: keyCounter++, text }));

const MIN_PREFIX = 2;

export default function TargetRoleForm({ initialValues }: TargetRoleFormProps) {
  // An existing role being edited started from a job description; otherwise the
  // title path is the simpler default for someone with a career goal in mind.
  const [mode, setMode] = useState<Mode>(
    initialValues?.jobDescription ? "jd" : "title"
  );
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [jobDescription, setJobDescription] = useState(
    initialValues?.jobDescription ?? ""
  );
  const [rows, setRows] = useState<Row[]>(
    toRows(initialValues?.requirements ?? [])
  );
  const [sourceOccupation, setSourceOccupation] =
    useState<OccupationSuggestion | null>(null);

  // Typeahead state.
  const [options, setOptions] = useState<OccupationSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [step, setStep] = useState<"fill" | "review">("fill");
  const [clientError, setClientError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    saveTargetRoleAction,
    undefined
  );
  const errorRef = useRef<HTMLDivElement>(null);

  const recordId = initialValues?.recordId;
  const requirements = rows
    .map((r) => r.text.trim())
    .filter((t) => t.length > 0);

  function showError(message: string) {
    setClientError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  // --- Title path -----------------------------------------------------------
  function handleTitleInputChange(value: string) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (value.trim().length < MIN_PREFIX) {
      setOptions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        setOptions(await suggestOccupationsAction(value));
      } finally {
        setSearching(false);
      }
    }, 250);
  }

  async function handleOccupationSelected(
    selected: OccupationSuggestion | null
  ) {
    if (!selected) {
      return;
    }
    setSourceOccupation(selected);
    setTitle(selected.name);
    setClientError(null);
    try {
      const { requirements: derived } =
        await deriveOccupationRequirementsAction(selected.code);
      setRows(toRows(derived.length > 0 ? derived : [""]));
    } catch {
      showError("Could not load that role's skills. Try another title.");
    }
  }

  // --- JD path --------------------------------------------------------------
  function handleExtract() {
    const jd = validateJobDescription(jobDescription);
    if (!jd.ok) {
      showError(jd.error);
      return;
    }
    setClientError(null);
    const extracted = extractRequirements(jd.value);
    setRows(toRows(extracted.length > 0 ? extracted : [""]));
  }

  // --- Shared ---------------------------------------------------------------
  function updateRow(key: number, text: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, text } : r)));
  }
  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }
  function addRow() {
    setRows((prev) => [...prev, { key: keyCounter++, text: "" }]);
  }

  function goToReview() {
    const result =
      mode === "title"
        ? validateTargetRoleFromTitle({ title, requirements })
        : validateTargetRoleIntake({ title, jobDescription, requirements });
    if (!result.ok) {
      showError(result.error);
      return;
    }
    setClientError(null);
    setStep("review");
  }

  if (state?.notice) {
    return (
      <Stack spacing={2}>
        <Alert severity="success" role="status">
          {state.notice} Your target role is saved to your profile.
        </Alert>
        <Link href="/dashboard">Back to your target roles</Link>
      </Stack>
    );
  }

  return (
    <Box component="form" action={formAction}>
      {recordId ? (
        <input type="hidden" name="record_id" value={recordId} />
      ) : null}
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="job_description" value={jobDescription} />
      {mode === "title" && sourceOccupation ? (
        <>
          <input
            type="hidden"
            name="source_occupation_title"
            value={sourceOccupation.name}
          />
          <input
            type="hidden"
            name="source_occupation_code"
            value={sourceOccupation.code}
          />
        </>
      ) : null}
      {requirements.map((text, i) => (
        <input key={i} type="hidden" name="requirements" value={text} />
      ))}

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

          <ToggleButtonGroup
            exclusive
            value={mode}
            onChange={(_, next: Mode | null) => {
              if (next) {
                setMode(next);
                setClientError(null);
              }
            }}
            aria-label="How to add this target role"
            size="small"
          >
            <ToggleButton value="title" aria-label="Pick a job title">
              Pick a job title
            </ToggleButton>
            <ToggleButton value="jd" aria-label="Paste a job description">
              Paste a job description
            </ToggleButton>
          </ToggleButtonGroup>

          {mode === "title" ? (
            <>
              <Autocomplete
                options={options}
                getOptionLabel={(o) => o.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                // The server already filters and ranks; don't re-filter client-side.
                filterOptions={(x) => x}
                loading={searching}
                loadingText="Searching…"
                onInputChange={(_, value) => handleTitleInputChange(value)}
                onChange={(_, selected) => handleOccupationSelected(selected)}
                noOptionsText="Type a job title to search…"
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Search for a job title"
                    helperText="Start typing and pick a role; its typical skills become your requirements."
                  />
                )}
              />
              <TextField
                label="Role title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                fullWidth
                helperText="Prefilled from your pick — edit it to match your goal."
              />
            </>
          ) : (
            <>
              <TextField
                label="Role title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                fullWidth
              />
              <TextField
                label="Job description"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                required
                fullWidth
                multiline
                minRows={6}
                helperText="Paste the full job description, then extract its requirements."
              />
              <Button
                type="button"
                variant="outlined"
                onClick={handleExtract}
                sx={{ alignSelf: "flex-start" }}
              >
                Extract requirements
              </Button>
            </>
          )}

          <Typography variant="h6" component="h2">
            Requirements
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Edit the wording, remove anything that doesn&apos;t fit, and add any
            that are missing.
          </Typography>

          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {mode === "title"
                ? "No requirements yet. Pick a job title above, or add them by hand."
                : "No requirements yet. Extract them from the job description above, or add them by hand."}
            </Typography>
          ) : (
            <Stack
              spacing={1}
              component="ul"
              sx={{ listStyle: "none", m: 0, p: 0 }}
            >
              {rows.map((row, i) => (
                <Stack
                  key={row.key}
                  component="li"
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center" }}
                >
                  <TextField
                    label={`Requirement ${i + 1}`}
                    value={row.text}
                    onChange={(e) => updateRow(row.key, e.target.value)}
                    fullWidth
                    size="small"
                  />
                  <IconButton
                    aria-label={`Remove requirement ${i + 1}`}
                    onClick={() => removeRow(row.key)}
                  >
                    ✕
                  </IconButton>
                </Stack>
              ))}
            </Stack>
          )}

          <Button
            type="button"
            onClick={addRow}
            sx={{ alignSelf: "flex-start" }}
          >
            Add a requirement
          </Button>

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
          <Typography variant="h6" component="h2">
            Review before saving
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Nothing is saved until you confirm. Each requirement&apos;s source
            (Framework, O*NET, or Job description) is shown once it&apos;s
            saved.
          </Typography>

          <Typography>
            <strong>Role:</strong> {title}
          </Typography>
          {mode === "title" && sourceOccupation ? (
            <Typography variant="body2" color="text.secondary">
              Derived from {sourceOccupation.name} (O*NET)
            </Typography>
          ) : null}
          <Box component="ul" sx={{ m: 0, pl: 3 }}>
            {requirements.map((text, i) => (
              <li key={i}>{text}</li>
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
