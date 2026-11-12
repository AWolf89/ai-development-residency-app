import { redirect } from "next/navigation";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
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
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={3}>
        <Link href="/dashboard">← Back to your account</Link>
        <Typography variant="h4" component="h1">
          Add a target role
        </Typography>
        <Typography color="text.secondary">
          Paste a job description, pull out its requirements, and save the role
          to your profile. You will review it before it is saved.
        </Typography>
        <TargetRoleForm />
      </Stack>
    </Container>
  );
}
