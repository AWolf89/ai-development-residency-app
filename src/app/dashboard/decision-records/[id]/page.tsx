import { notFound, redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { createClient } from "@/lib/supabase/server";
import {
  getDecisionRecordById,
  getLinkedFileId,
  getUserFiles,
} from "@/lib/decision-records/queries";
import PageHeading from "@/components/PageHeading";
import DecisionRecordForm from "../DecisionRecordForm";

export default async function EditDecisionRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // RLS scopes this to the owner; a non-owner (or missing id) gets null -> 404.
  const record = await getDecisionRecordById(supabase, id);
  if (!record) {
    notFound();
  }

  const [files, linkedFileId] = await Promise.all([
    getUserFiles(supabase, user.id),
    getLinkedFileId(supabase, id),
  ]);

  return (
    <Box sx={{ px: { xs: 2, md: 7 }, py: { xs: 4, md: 6 }, maxWidth: 820 }}>
      <Stack spacing={3}>
        <Link href="/dashboard">← Back to your account</Link>
        <PageHeading
          title="Edit decision record"
          subtitle="Add the recommended detail or correct anything. You will review it before it is saved."
        />
        <Link href={`/dashboard/decision-records/${id}/review`}>
          Review this record for unsupported or overstated claims →
        </Link>
        <DecisionRecordForm
          files={files}
          initialValues={{
            recordId: record.id,
            title: record.title ?? "",
            situation: record.situation ?? "",
            cue: record.cue ?? "",
            decision: record.decision ?? "",
            why: record.why ?? "",
            outcome: record.outcome ?? "",
            source: record.source ?? "",
            category: record.category ?? "",
            isMetric: record.is_metric ?? false,
            fileId: linkedFileId ?? "",
          }}
        />
      </Stack>
    </Box>
  );
}
