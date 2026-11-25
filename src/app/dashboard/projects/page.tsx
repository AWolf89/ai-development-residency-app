import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { getProjectsOverview } from "@/lib/projects/queries";
import {
  computeProjectHealth,
  deriveDisplayStatus,
  type ProjectCardData,
} from "@/lib/projects/health";
import PageHeading from "@/components/PageHeading";
import EvidenceLibraryTabs from "@/components/EvidenceLibraryTabs";
import ProjectForm from "./ProjectForm";
import ProjectsList from "./ProjectsList";

const PAGE_SX = {
  px: { xs: 2, md: 7 },
  py: { xs: 4, md: 6 },
  maxWidth: 1180,
} as const;

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const overview = await getProjectsOverview(supabase, user.id);

  // Build each card's health from its claim lifecycles (pure) — the list speaks in supported /
  // need-evidence / challenged and a derived display status, all from real rows (plan §6.2).
  const cards: ProjectCardData[] = overview.map(
    ({ project, claimLifecycles, sourceCount }) => {
      const health = computeProjectHealth(claimLifecycles);
      return {
        id: project.id,
        name: project.name,
        subtitle: [project.role, project.organisation, project.dateRangeLabel]
          .filter(Boolean)
          .join(" · "),
        status: deriveDisplayStatus(project.status, health),
        sourceCount,
        health,
      };
    }
  );

  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={4}>
        <EvidenceLibraryTabs />
        <PageHeading
          title="Projects"
          subtitle="Each project groups the sources, decisions, and claims from one piece of work. Open one to build its evidence."
        />

        {cards.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No projects yet. Add one below, then assign your evidence to it.
          </Typography>
        ) : (
          <ProjectsList cards={cards} />
        )}

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
