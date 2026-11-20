import { notFound, redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { getProjectWithLinks } from "@/lib/projects/queries";
import PageHeading from "@/components/PageHeading";
import StatusChip from "@/components/StatusChip";
import type { TagTone } from "@/theme-tokens";
import ProjectActions from "./ProjectActions";

const PAGE_SX = {
  px: { xs: 2, md: 7 },
  py: { xs: 4, md: 6 },
  maxWidth: 1180,
} as const;

const STATUS_TONE: Record<string, TagTone> = { active: "green", archived: "gray" };

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary">
      {children}
    </Typography>
  );
}

export default async function ProjectDetailPage({
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

  const detail = await getProjectWithLinks(supabase, user.id, id);
  if (!detail) {
    notFound();
  }

  const { project, files, records, moments, countsLabel } = detail;
  const subtitleParts = [project.role, project.organisation, project.dateRangeLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={4}>
        <PageHeading
          title={
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: "center", flexWrap: "wrap" }}
            >
              <span>{project.name}</span>
              <StatusChip
                label={project.status === "archived" ? "Archived" : "Active"}
                tone={STATUS_TONE[project.status] ?? "gray"}
              />
            </Stack>
          }
          subtitle={subtitleParts || undefined}
          action={<ProjectActions projectId={project.id} />}
        />

        {project.summary ? (
          <Typography sx={{ whiteSpace: "pre-wrap" }}>
            {project.summary}
          </Typography>
        ) : null}

        <Typography variant="caption" color="text.secondary">
          {countsLabel} linked
        </Typography>

        <Divider />

        <Stack spacing={1.5}>
          <Typography variant="h6" component="h2">
            Files
          </Typography>
          {files.length === 0 ? (
            <EmptyLine>
              No files in this project yet. Open a file and assign it here.
            </EmptyLine>
          ) : (
            <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
              {files.map((f) => (
                <Box component="li" key={f.id}>
                  <Card variant="outlined">
                    <CardActionArea href={`/dashboard/files/${f.id}`}>
                      <CardContent sx={{ py: 1.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {f.name}
                        </Typography>
                        {f.caption ? (
                          <Typography variant="caption" color="text.secondary">
                            {f.caption}
                          </Typography>
                        ) : null}
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Box>
              ))}
            </Stack>
          )}
        </Stack>

        <Stack spacing={1.5}>
          <Typography variant="h6" component="h2">
            Decision records
          </Typography>
          {records.length === 0 ? (
            <EmptyLine>No decision records assigned to this project yet.</EmptyLine>
          ) : (
            <Stack component="ul" spacing={0.5} sx={{ listStyle: "none", m: 0, p: 0 }}>
              {records.map((r) => (
                <Box component="li" key={r.id}>
                  <Link href={`/dashboard/decision-records/${r.id}`}>
                    {r.title}
                  </Link>
                </Box>
              ))}
            </Stack>
          )}
        </Stack>

        <Stack spacing={1.5}>
          <Typography variant="h6" component="h2">
            Learning moments
          </Typography>
          {moments.length === 0 ? (
            <EmptyLine>No learning moments assigned to this project yet.</EmptyLine>
          ) : (
            <Stack component="ul" spacing={0.5} sx={{ listStyle: "none", m: 0, p: 0 }}>
              {moments.map((m) => (
                <Typography component="li" variant="body2" key={m.id}>
                  {m.kind}
                </Typography>
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}
