import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { createClient } from "@/lib/supabase/server";
import PageHeading from "@/components/PageHeading";
import TargetRoleForm from "../TargetRoleForm";

export default async function NewTargetRolePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <Box sx={{ px: { xs: 2, md: 7 }, py: { xs: 4, md: 6 }, maxWidth: 820 }}>
      <Stack spacing={3}>
        <Link href="/dashboard">← Back to your account</Link>
        <PageHeading
          title="Add a target role"
          subtitle="Paste a job description, pull out its requirements, and save the role to your profile. You will review it before it is saved."
        />
        <TargetRoleForm />
      </Stack>
    </Box>
  );
}
