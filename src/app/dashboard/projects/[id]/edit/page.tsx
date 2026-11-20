import { notFound, redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/projects/queries";
import PageHeading from "@/components/PageHeading";
import ProjectForm from "../../ProjectForm";

const PAGE_SX = {
  px: { xs: 2, md: 7 },
  py: { xs: 4, md: 6 },
  maxWidth: 820,
} as const;

export default async function EditProjectPage({
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

  const project = await getProject(supabase, user.id, id);
  if (!project) {
    notFound();
  }

  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={3}>
        <Link href={`/dashboard/projects/${id}`}>← Back to the project</Link>
        <PageHeading
          title="Edit project"
          subtitle="Update the details or status. Your linked evidence stays attached."
        />
        <ProjectForm
          initial={{
            projectId: project.id,
            name: project.name,
            role: project.role ?? "",
            organisation: project.organisation ?? "",
            summary: project.summary ?? "",
            status: project.status,
            startedOn: project.started_on ?? "",
            endedOn: project.ended_on ?? "",
          }}
        />
      </Stack>
    </Box>
  );
}
