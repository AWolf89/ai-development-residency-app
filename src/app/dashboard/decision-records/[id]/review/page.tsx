import { notFound, redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { getDecisionRecordById } from "@/lib/decision-records/queries";
import {
  getLatestCompleteReview,
  getReviewFlags,
} from "@/lib/reviewer/queries";
import type { ReviewFlag } from "@/lib/reviewer/types";
import PageHeading from "@/components/PageHeading";
import ReviewPanel from "./ReviewPanel";

/**
 * The Reviewer Agent Check page (ADR-0016): run a grounded quality review of one saved decision
 * record and accept / edit / reject the flags. Auth and RLS scope everything to the owner; the
 * HITL-gated persistence lives in the orchestrator the client actions call.
 */
export default async function ReviewRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS scopes this to the owner; a non-owner (or missing id) gets null -> 404.
  const record = await getDecisionRecordById(supabase, id);
  if (!record) notFound();

  const existing = await getLatestCompleteReview(supabase, id);
  const priorFlags: ReviewFlag[] = existing
    ? (await getReviewFlags(supabase, existing.id)).map((row) => ({
        dimension: row.dimension,
        severity: row.severity,
        targetField: row.target_field,
        message: row.message,
        citations: row.citations ?? [],
        disposition: row.disposition,
      }))
    : [];

  return (
    <Box sx={{ px: { xs: 2, md: 7 }, py: { xs: 4, md: 6 }, maxWidth: 820 }}>
      <Stack spacing={3}>
        <Link href={`/dashboard/decision-records/${id}`}>
          ← Back to the record
        </Link>
        <PageHeading
          title="Review this record"
          subtitle="A grounded check of your record against your own evidence. You decide what to keep."
        />

        <Box>
          <Typography variant="h6" component="h2" gutterBottom>
            {record.title}
          </Typography>
          {record.outcome && (
            <Typography variant="body2" color="text.secondary">
              {record.outcome}
            </Typography>
          )}
        </Box>

        <Divider />

        <ReviewPanel
          recordId={id}
          alreadyReviewed={existing !== null}
          priorFlags={priorFlags}
        />
      </Stack>
    </Box>
  );
}
