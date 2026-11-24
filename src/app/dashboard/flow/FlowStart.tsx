"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { startRunAction } from "@/lib/orchestrator/actions";
import { brand } from "@/theme-tokens";

export type FlowStartFile = { id: string; fileName: string };

/**
 * The guided-flow start screen: pick one uploaded file to walk through the flow. Starting a run is
 * the existing `startRunAction`; we then navigate to `?run=<id>` so the run id lives in the URL and
 * the page can rehydrate on reopen (AC3). No run logic lives here.
 */
export default function FlowStart({ files }: { files: FlowStartFile[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function start(fileId: string) {
    setError(null);
    setStarting(fileId);
    startTransition(async () => {
      try {
        const result = await startRunAction({ fileId });
        router.push(`/dashboard/flow?run=${result.runId}`);
      } catch {
        setError("Couldn’t start a flow for that file. Please try again.");
        setStarting(null);
      }
    });
  }

  if (files.length === 0) {
    return (
      <Card variant="outlined" sx={{ borderColor: brand.hairline }}>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" component="h2">
              Upload a file to begin
            </Typography>
            <Typography variant="body2" color="text.secondary">
              The guided flow walks one uploaded document through reconcile,
              propose, interview, and review. Upload a file first, then start a
              flow from here.
            </Typography>
            <Box>
              <Button variant="contained" href="/dashboard/files">
                Go to your files
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      {error ? (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      ) : null}
      <Typography variant="h6" component="h2">
        Pick a file to walk through
      </Typography>
      <Stack
        component="ul"
        spacing={1.5}
        sx={{ listStyle: "none", m: 0, p: 0 }}
      >
        {files.map((file) => (
          <Card
            key={file.id}
            variant="outlined"
            component="li"
            sx={{ borderColor: brand.hairline }}
          >
            <CardContent>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                sx={{
                  alignItems: { sm: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Typography sx={{ minWidth: 0, wordBreak: "break-word" }}>
                  {file.fileName}
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => start(file.id)}
                  disabled={pending}
                  sx={{
                    flexShrink: 0,
                    bgcolor: "#c2561f",
                    "&:hover": { bgcolor: "#a84716" },
                  }}
                  aria-label={`Start the guided flow for ${file.fileName}`}
                >
                  {starting === file.id ? "Starting…" : "Start guided flow"}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
