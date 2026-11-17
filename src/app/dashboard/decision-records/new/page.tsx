import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { createClient } from "@/lib/supabase/server";
import { getUserFiles } from "@/lib/decision-records/queries";
import PageHeading from "@/components/PageHeading";
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
    <Box sx={{ px: { xs: 2, md: 7 }, py: { xs: 4, md: 6 }, maxWidth: 820 }}>
      <Stack spacing={3}>
        <Link href="/dashboard">← Back to your account</Link>
        <PageHeading
          title="Add a decision record"
          subtitle="Capture a decision from your work: the situation, what you noticed, what you decided and why, and how it turned out. You will review it before it is saved."
        />
        <DecisionRecordForm files={files} />
      </Stack>
    </Box>
  );
}
