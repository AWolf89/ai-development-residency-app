import { notFound, redirect } from "next/navigation";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getDecisionRecordById,
  getLinkedFileId,
  getUserFiles,
} from "@/lib/decision-records/queries";
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
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={3}>
        <Link component={NextLink} href="/dashboard">
          ← Back to your account
        </Link>
        <Typography variant="h4" component="h1">
          Edit decision record
        </Typography>
        <Typography color="text.secondary">
          Add the recommended detail or correct anything. You will review it
          before it is saved.
        </Typography>
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
            fileId: linkedFileId ?? "",
          }}
        />
      </Stack>
    </Container>
  );
}
