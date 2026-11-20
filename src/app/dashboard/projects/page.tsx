import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { getProjects } from "@/lib/projects/queries";
import { mapProjectRowToView } from "@/lib/projects/mappers";
import PageHeading from "@/components/PageHeading";
import StatusChip from "@/components/StatusChip";
import type { TagTone } from "@/theme-tokens";
import { brand } from "@/theme-tokens";
import ProjectForm from "./ProjectForm";

const PAGE_SX = {
  px: { xs: 2, md: 7 },
  py: { xs: 4, md: 6 },
  maxWidth: 1180,
} as const;

const STATUS_TONE: Record<string, TagTone> = {
  active: "green",
  archived: "gray",
};

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const rows = await getProjects(supabase, user.id);
  const projects = rows.map(mapProjectRowToView);

  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={4}>
        <PageHeading
          title="Projects"
          subtitle="Group your files, decision records, and learning moments by the work they came from — and the role you played in each."
        />

        <Stack spacing={1.5}>
          <Typography variant="h6" component="h2">
            Your projects
          </Typography>

          {projects.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No projects yet. Add one below, then assign your evidence to it.
            </Typography>
          ) : (
            <Stack
              spacing={1.5}
              component="ul"
              sx={{ listStyle: "none", m: 0, p: 0 }}
            >
              {projects.map((project) => (
                <Box component="li" key={project.id}>
                  <Card
                    variant="outlined"
                    sx={{ borderLeft: `4px solid ${brand.accent}` }}
                  >
                    <CardActionArea
                      href={`/dashboard/projects/${project.id}`}
                      aria-label={`Open project: ${project.name}`}
                    >
                      <CardContent>
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ alignItems: "center", flexWrap: "wrap" }}
                        >
                          <Typography variant="subtitle1" component="h3">
                            {project.name}
                          </Typography>
                          <StatusChip
                            label={
                              project.status === "archived"
                                ? "Archived"
                                : "Active"
                            }
                            tone={STATUS_TONE[project.status] ?? "gray"}
                          />
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {[
                            project.role,
                            project.organisation,
                            project.dateRangeLabel || null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No details yet"}
                        </Typography>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Box>
              ))}
            </Stack>
          )}
        </Stack>

        <Divider />

        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            Add a project
          </Typography>
          <ProjectForm />
        </Stack>
      </Stack>
    </Box>
  );
}
