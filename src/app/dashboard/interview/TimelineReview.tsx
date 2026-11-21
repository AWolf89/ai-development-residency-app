"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import { useFormStatus } from "react-dom";
import type { Timeline, TimelineEntry } from "@/lib/interview/timeline";
import { brand } from "@/theme-tokens";
import { confirmTimelineAction } from "./actions";

// One editable row: the date is held as a YYYY-MM-DD string (or "") for the native date input;
// fileIds / versionHint are carried through untouched so the saved timeline keeps its provenance.
type Row = {
  id: string;
  label: string;
  date: string;
  fileIds: string[];
  versionHint: string | null;
};

const UPPER_LABEL_SX = {
  textTransform: "uppercase",
  letterSpacing: 0.8,
  fontSize: 12,
  fontWeight: 700,
  color: brand.tag.blue.fg,
} as const;

function toRow(entry: TimelineEntry): Row {
  return {
    id: entry.id,
    label: entry.label,
    date: entry.date ? entry.date.slice(0, 10) : "",
    fileIds: entry.fileIds,
    versionHint: entry.versionHint,
  };
}

/** Serialise the rows back to a Timeline, dropping points the user left unlabelled. */
function toTimeline(rows: Row[]): Timeline {
  return rows
    .filter((r) => r.label.trim() !== "")
    .map((r) => ({
      id: r.id,
      label: r.label.trim(),
      date: r.date === "" ? null : r.date,
      fileIds: r.fileIds,
      versionHint: r.versionHint,
    }));
}

function StartButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="contained" disabled={pending}>
      {pending
        ? "Starting…"
        : count > 0
          ? "Looks right — start the interview"
          : "Start without a timeline"}
    </Button>
  );
}

/**
 * The timeline review/correct step of the Decision-Point Interview (ADR-0021). The server drafts
 * a timeline from the project's files; here the user fixes labels and dates, removes noise, and
 * adds points by hand (the manual fallback when files have no usable dates). On confirm it posts
 * the corrected timeline to `confirmTimelineAction`, which persists it and starts the questions.
 * No question is asked until the user confirms — nothing here is saved as a record.
 */
export default function TimelineReview({
  sessionId,
  draft,
}: {
  sessionId: string;
  draft: Timeline;
}) {
  const [rows, setRows] = useState<Row[]>(() => draft.map(toRow));
  const [nextManual, setNextManual] = useState(1);

  const update = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));
  const add = () => {
    setRows((rs) => [
      ...rs,
      {
        id: `manual-${nextManual}`,
        label: "",
        date: "",
        fileIds: [],
        versionHint: null,
      },
    ]);
    setNextManual((n) => n + 1);
  };

  const timelineJson = JSON.stringify(toTimeline(rows));
  const labelledCount = rows.filter((r) => r.label.trim() !== "").length;

  return (
    <Card variant="outlined" sx={{ bgcolor: "#fff" }}>
      <CardContent>
        <Stack spacing={2.5}>
          <Stack spacing={0.5}>
            <Typography sx={UPPER_LABEL_SX}>Before we start</Typography>
            <Typography sx={{ fontSize: { xs: 18, md: 20 } }}>
              Here&rsquo;s a timeline I drafted from your files. Fix anything
              that&rsquo;s off, then we&rsquo;ll talk through each decision.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Dates come from when each file was uploaded, so they may be rough
              — correct them here. Nothing is saved yet.
            </Typography>
          </Stack>

          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              I couldn&rsquo;t date your files, so there&rsquo;s nothing to show
              yet. Add the key moments of the project yourself, or start without
              a timeline and I&rsquo;ll ask open questions.
            </Typography>
          ) : (
            <Stack
              component="ol"
              spacing={1.5}
              sx={{ listStyle: "none", m: 0, p: 0 }}
            >
              {rows.map((row, index) => (
                <Stack
                  key={row.id}
                  component="li"
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.5}
                  sx={{
                    alignItems: { sm: "flex-start" },
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: brand.tag.blue.bg,
                  }}
                >
                  <TextField
                    label={`Decision point ${index + 1}`}
                    value={row.label}
                    onChange={(e) => update(row.id, { label: e.target.value })}
                    fullWidth
                    sx={{ bgcolor: "#fff" }}
                    helperText={
                      row.versionHint
                        ? `Versions: ${row.versionHint}`
                        : row.fileIds.length > 0
                          ? `${row.fileIds.length} file${row.fileIds.length === 1 ? "" : "s"}`
                          : "Added by you"
                    }
                  />
                  <TextField
                    type="date"
                    label="When"
                    value={row.date}
                    onChange={(e) => update(row.id, { date: e.target.value })}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ bgcolor: "#fff", width: { xs: "100%", sm: 190 } }}
                  />
                  <IconButton
                    aria-label={`Remove decision point ${index + 1}`}
                    onClick={() => remove(row.id)}
                    sx={{ mt: { sm: 1 } }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
          )}

          <Box>
            <Button variant="outlined" onClick={add}>
              + Add a decision point
            </Button>
          </Box>

          <Box component="form" action={confirmTimelineAction}>
            <input type="hidden" name="session_id" value={sessionId} />
            <input type="hidden" name="timeline" value={timelineJson} />
            <StartButton count={labelledCount} />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
