import { notFound, redirect } from "next/navigation";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import {
  getTargetRoleById,
  getRequirementsForRoles,
} from "@/lib/target-roles/queries";
import TargetRoleForm from "../TargetRoleForm";

export default async function EditTargetRolePage({
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
  const role = await getTargetRoleById(supabase, id);
  if (!role) {
    notFound();
  }

  const requirements = await getRequirementsForRoles(supabase, [id]);

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={3}>
        <Link href="/dashboard">← Back to your account</Link>
        <Typography variant="h4" component="h1">
          Edit target role
        </Typography>
        <Typography color="text.secondary">
          Update the title, job description, or requirements. You will review it
          before it is saved.
        </Typography>
        <TargetRoleForm
          initialValues={{
            recordId: role.id,
            title: role.title ?? "",
            jobDescription: role.job_description ?? "",
            requirements: requirements.map((r) => r.requirement_text),
          }}
        />
      </Stack>
    </Container>
  );
}
