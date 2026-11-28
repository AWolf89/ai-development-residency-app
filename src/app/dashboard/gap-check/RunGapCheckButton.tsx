"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { visuallyHidden } from "@mui/utils";
import { useFormStatus } from "react-dom";
import { runGapCheck } from "./actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <Button type="submit" variant="contained" disabled={pending}>
        {pending ? "Checking your evidence…" : label}
      </Button>
      {/* A disabled button's label change isn't announced; mirror it in a live
          region so screen readers hear the gap check start (WCAG 4.1.3). */}
      <Box component="span" role="status" sx={visuallyHidden}>
        {pending ? "Checking your evidence…" : ""}
      </Box>
    </>
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
