import { notFound, redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import {
  getTargetRoleById,
  getRequirementsForRoles,
} from "@/lib/target-roles/queries";
import PageHeading from "@/components/PageHeading";
import TargetRoleForm from "../TargetRoleForm";
import DeleteTargetRoleButton from "../DeleteTargetRoleButton";

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
    <Box sx={{ px: { xs: 2, md: 7 }, py: { xs: 4, md: 6 }, maxWidth: 820 }}>
      <Stack spacing={3}>
        <Link href="/dashboard">← Back to your account</Link>
        <PageHeading
          title="Edit target role"
          subtitle="Update the title, job description, or requirements. You will review it before it is saved."
        />
        <TargetRoleForm
          initialValues={{
            recordId: role.id,
            title: role.title ?? "",
            jobDescription: role.job_description ?? "",
            requirements: requirements.map((r) => r.requirement_text),
          }}
        />

        <Divider />

        <Stack spacing={1}>
          <Typography variant="h6" component="h2">
            Delete this target role
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Removing a target role also removes its requirements and any gap
            assessments. This cannot be undone.
          </Typography>
          <DeleteTargetRoleButton roleId={role.id} roleTitle={role.title} />
        </Stack>
      </Stack>
    </Box>
  );
}
