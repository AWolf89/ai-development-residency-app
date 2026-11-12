import { redirect } from "next/navigation";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { getUserFiles } from "@/lib/decision-records/queries";
import DecisionRecordForm from "../DecisionRecordForm";

export default async function NewDecisionRecordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const files = await getUserFiles(supabase, user.id);

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={3}>
        <Link href="/dashboard">← Back to your account</Link>
        <Typography variant="h4" component="h1">
          Add a decision record
        </Typography>
        <Typography color="text.secondary">
          Capture a decision from your work: the situation, what you noticed,
          what you decided and why, and how it turned out. You will review it
          before it is saved.
        </Typography>
        <DecisionRecordForm files={files} />
      </Stack>
    </Container>
  );
}
