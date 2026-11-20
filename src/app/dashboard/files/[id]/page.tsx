import { notFound, redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { createClient } from "@/lib/supabase/server";
import { getFileDetail } from "@/lib/files/queries";
import { formatBytes } from "@/lib/files/mappers";
import { getProjects } from "@/lib/projects/queries";
import { getDecisionRecords } from "@/lib/decision-records/queries";
import PageHeading from "@/components/PageHeading";
import FileHubPanel from "./FileHubPanel";

const PAGE_SX = {
  px: { xs: 2, md: 7 },
  py: { xs: 4, md: 6 },
  maxWidth: 1180,
} as const;

export default async function FileDetailPage({
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

  const file = await getFileDetail(supabase, user.id, id);
  if (!file) {
    notFound();
  }

  const [projectRows, records] = await Promise.all([
    getProjects(supabase, user.id),
    getDecisionRecords(supabase, user.id),
  ]);
  const projects = projectRows.map((p) => ({ id: p.id, name: p.name }));

  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={4}>
        <PageHeading
          title={file.fileName}
          subtitle={`${formatBytes(file.sizeBytes)} · Uploaded ${new Date(
            file.createdAt
          ).toLocaleDateString()}`}
        />
        <Link href="/dashboard/files" variant="body2">
          ← Back to your files
        </Link>

        <Divider />

        <FileHubPanel
          fileId={file.id}
          initialCaption={file.caption ?? ""}
          initialProjectId={file.projectId ?? ""}
          projects={projects}
          linkedRecords={file.linkedRecords}
          records={records.map((r) => ({ id: r.id, title: r.title }))}
        />
      </Stack>
    </Box>
  );
}
