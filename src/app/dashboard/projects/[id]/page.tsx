import { notFound, redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { getProjectHub } from "@/lib/projects/queries";
import {
  CLAIM_BADGE_META,
  DISPLAY_STATUS_META,
  type ClaimBadge,
} from "@/lib/projects/health";
import StatusChip from "@/components/StatusChip";
import PageHeading from "@/components/PageHeading";
import { brand } from "@/theme-tokens";
import ProjectActions from "./ProjectActions";
import { ProjectHealthBar, ProjectHealthLegend } from "../ProjectHealthBar";

const PAGE_SX = {
  px: { xs: 2, md: 7 },
  py: { xs: 4, md: 6 },
  maxWidth: 1180,
} as const;

/** One section card. `wide` spans both columns of the 2-up grid. */
function Section({
  title,
  wide,
  children,
}: {
  title: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      variant="outlined"
      component="section"
      sx={{ gridColumn: wide ? { md: "1 / -1" } : undefined, height: "100%" }}
    >
      <CardContent>
        <Typography
          component="h2"
          sx={{
            textTransform: "uppercase",
            letterSpacing: 0.6,
            fontSize: 12,
            fontWeight: 700,
            color: "text.secondary",
            mb: 1.5,
          }}
        >
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="body2"
      color="text.secondary"
      sx={{ fontStyle: "italic" }}
    >
      {children}
    </Typography>
  );
}

function ClaimBadgeChip({ badge }: { badge: ClaimBadge }) {
  const meta = CLAIM_BADGE_META[badge];
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 12,
        fontWeight: 600,
        px: 1.25,
        py: 0.25,
        borderRadius: 999,
        bgcolor: meta.color,
        color: meta.fg,
        flexShrink: 0,
      }}
    >
      {meta.label}
    </Box>
  );
}

export default async function ProjectHubPage({
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

  const hub = await getProjectHub(supabase, user.id, id);
  if (!hub) {
    notFound();
  }

  const { project, status, health, sourceCount } = hub;
  const statusMeta = DISPLAY_STATUS_META[status];
  const subtitle = [project.role, project.organisation, project.dateRangeLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={3}>
        <Box>
          <Link
            href="/dashboard/projects"
            variant="caption"
            sx={{ color: "text.secondary" }}
          >
            ← Projects
          </Link>
        </Box>

        <PageHeading
          title={
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: "center", flexWrap: "wrap" }}
            >
              <span>{project.name}</span>
              <StatusChip label={statusMeta.label} tone={statusMeta.tone} />
            </Stack>
          }
          subtitle={subtitle || undefined}
          action={<ProjectActions projectId={project.id} />}
        />

        <Stack spacing={1}>
          <ProjectHealthBar health={health} width={420} />
          <ProjectHealthLegend health={health} />
          <Typography variant="body2" color="text.secondary">
            {health.claims} claim{health.claims === 1 ? "" : "s"} ·{" "}
            {sourceCount} source{sourceCount === 1 ? "" : "s"}
          </Typography>
        </Stack>

        {hub.openQuestions.length > 0 ? (
          <Card
            variant="outlined"
            sx={{
              borderColor: brand.tag.orange.fg,
              bgcolor: brand.tag.orange.bg,
            }}
          >
            <CardContent>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                sx={{
                  alignItems: { sm: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Typography variant="body2" sx={{ color: brand.tag.orange.fg }}>
                  <strong>
                    {hub.openQuestions.length} open question
                    {hub.openQuestions.length === 1 ? "" : "s"}.
                  </strong>{" "}
                  {hub.openQuestions[0].text}
                </Typography>
                <Link
                  href="/dashboard/investigations"
                  sx={{
                    color: brand.tag.orange.fg,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  Open investigation queue →
                </Link>
              </Stack>
            </CardContent>
          </Card>
        ) : null}

        <Box
          sx={{
            display: "grid",
            gap: 2.5,
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          }}
        >
          <Section title="Overview" wide>
            {project.summary ? (
              <Typography sx={{ whiteSpace: "pre-wrap" }}>
                {project.summary}
              </Typography>
            ) : (
              <EmptyLine>No overview yet.</EmptyLine>
            )}
          </Section>

          <Section title="Role & responsibilities">
            {subtitle ? (
              <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                {project.role ? (
                  <>
                    <strong>Role:</strong> {project.role}
                    <br />
                  </>
                ) : null}
                {project.organisation ? (
                  <>
                    <strong>Organisation:</strong> {project.organisation}
                    <br />
                  </>
                ) : null}
                {project.dateRangeLabel ? (
                  <>
                    <strong>Span:</strong> {project.dateRangeLabel}
                  </>
                ) : null}
              </Typography>
            ) : (
              <EmptyLine>No role details yet.</EmptyLine>
            )}
          </Section>

          <Section title="Skills">
            {hub.skills.length > 0 ? (
              <Stack
                direction="row"
                spacing={1}
                sx={{ flexWrap: "wrap", gap: 1 }}
              >
                {hub.skills.map((skill) => (
                  <StatusChip key={skill} label={skill} tone="green" />
                ))}
              </Stack>
            ) : (
              <EmptyLine>
                Shown once this project&apos;s records are categorised.
              </EmptyLine>
            )}
          </Section>

          <Section
            title={`Evidence (${sourceCount} source${sourceCount === 1 ? "" : "s"})`}
          >
            {hub.files.length > 0 ? (
              <Stack
                component="ul"
                spacing={0}
                sx={{ listStyle: "none", m: 0, p: 0 }}
              >
                {hub.files.map((f) => (
                  <Stack
                    key={f.id}
                    component="li"
                    direction="row"
                    spacing={1}
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                      py: 1,
                      borderBottom: `1px solid ${brand.hairline}`,
                      "&:last-of-type": { borderBottom: "none" },
                    }}
                  >
                    <Typography variant="body2">{f.name}</Typography>
                    <Link
                      href={`/dashboard/files/${f.id}`}
                      sx={{
                        color: brand.accent,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      Open →
                    </Link>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <EmptyLine>No files assigned to this project yet.</EmptyLine>
            )}
          </Section>

          <Section title="Decisions">
            {hub.decisions.length > 0 ? (
              <Stack
                component="ul"
                spacing={1}
                sx={{ listStyle: "none", m: 0, p: 0 }}
              >
                {hub.decisions.map((d) => (
                  <Typography
                    component="li"
                    variant="body2"
                    key={d.id}
                    sx={{ lineHeight: 1.5 }}
                  >
                    <Link
                      href={`/dashboard/decision-records/${d.id}`}
                      sx={{ fontWeight: 600 }}
                    >
                      {d.title}
                    </Link>{" "}
                    — {d.decision}
                  </Typography>
                ))}
              </Stack>
            ) : (
              <EmptyLine>No decisions recorded yet.</EmptyLine>
            )}
          </Section>

          <Section title="Outcomes" wide>
            {hub.outcomes.length > 0 ? (
              <Stack
                component="ul"
                spacing={1}
                sx={{ listStyle: "none", m: 0, p: 0 }}
              >
                {hub.outcomes.map((o) => (
                  <Typography
                    component="li"
                    variant="body2"
                    key={o.id}
                    sx={{ lineHeight: 1.5 }}
                  >
                    {o.outcome}
                  </Typography>
                ))}
              </Stack>
            ) : (
              <EmptyLine>
                No outcomes recorded yet — a decision without a result is an
                open question below.
              </EmptyLine>
            )}
          </Section>

          <Section title="Learning">
            {hub.moments.length > 0 ? (
              <Stack
                component="ul"
                spacing={0.5}
                sx={{ listStyle: "none", m: 0, p: 0 }}
              >
                {hub.moments.map((m) => (
                  <Typography component="li" variant="body2" key={m.id}>
                    {m.kind}
                  </Typography>
                ))}
              </Stack>
            ) : (
              <EmptyLine>No learning moments linked yet.</EmptyLine>
            )}
          </Section>

          <Section title={`Claims (${hub.claims.length})`}>
            {hub.claims.length > 0 ? (
              <Stack
                component="ul"
                spacing={0}
                sx={{ listStyle: "none", m: 0, p: 0 }}
              >
                {hub.claims.map((c) => (
                  <Stack
                    key={c.id}
                    component="li"
                    direction="row"
                    spacing={1}
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                      py: 1,
                      borderBottom: `1px solid ${brand.hairline}`,
                      "&:last-of-type": { borderBottom: "none" },
                    }}
                  >
                    <Link
                      href={`/dashboard/decision-records/${c.id}`}
                      variant="body2"
                      sx={{ minWidth: 0 }}
                    >
                      {c.title}
                    </Link>
                    <ClaimBadgeChip badge={c.badge} />
                  </Stack>
                ))}
              </Stack>
            ) : (
              <EmptyLine>No claims in this project yet.</EmptyLine>
            )}
          </Section>

          <Section title="Open questions" wide>
            {hub.openQuestions.length > 0 ? (
              <Stack
                component="ul"
                spacing={0}
                sx={{ listStyle: "none", m: 0, p: 0 }}
              >
                {hub.openQuestions.map((q) => (
                  <Stack
                    key={q.id}
                    component="li"
                    direction="row"
                    spacing={1}
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                      py: 1,
                      borderBottom: `1px solid ${brand.hairline}`,
                      "&:last-of-type": { borderBottom: "none" },
                    }}
                  >
                    <Typography variant="body2">{q.text}</Typography>
                    <Link
                      href={q.href}
                      sx={{
                        color: brand.accent,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      Investigate →
                    </Link>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <EmptyLine>
                Nothing outstanding — every decision has an outcome and no claim
                is challenged.
              </EmptyLine>
            )}
          </Section>
        </Box>
      </Stack>
    </Box>
  );
}
