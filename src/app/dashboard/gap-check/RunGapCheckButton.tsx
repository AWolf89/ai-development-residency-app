"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { useFormStatus } from "react-dom";
import { runGapCheck } from "./actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="contained" disabled={pending}>
      {pending ? "Checking your evidence…" : label}
    </Button>
  );
}

/**
 * The on-demand trigger for a gap check (ADR-0012). A tiny client wrapper so the button
 * can show a pending state while the Server Action classifies every requirement; all the
 * work happens server-side in `runGapCheck`.
 */
export default function RunGapCheckButton({
  roleId,
  hasAssessments,
}: {
  roleId: string;
  hasAssessments: boolean;
}) {
  return (
    <Box component="form" action={runGapCheck}>
      <input type="hidden" name="roleId" value={roleId} />
      <SubmitButton
        label={hasAssessments ? "Re-run gap check" : "Run gap check"}
      />
    </Box>
  );
}
