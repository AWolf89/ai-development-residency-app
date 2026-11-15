import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import {
  getTargetRoles,
  getRequirementsForRoles,
} from "@/lib/target-roles/queries";
import { getAssessmentsForRole, type AssessmentItem } from "@/lib/gap/queries";
import {
  verdictToBucket,
  summarize,
  evidenceCell,
  type GapSummary,
} from "@/lib/gap/presentation";
import StatusChip from "@/components/StatusChip";
import { serifStack, brand } from "@/theme-tokens";
import RunGapCheckButton from "./RunGapCheckButton";

const PAGE_SX = {
  px: { xs: 2, md: 7 },
  py: { xs: 4, md: 6 },
  maxWidth: 1180,
} as const;

function PageHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Stack spacing={1}>
      <Typography
        component="h1"
        sx={{ fontFamily: serifStack, fontSize: { xs: 32, md: 44 }, m: 0 }}
      >
        {title}
      </Typography>
      <Typography color="text.secondary">{subtitle}</Typography>
    </Stack>
  );
}

function SummaryTile({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: string;
}) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 220 }}>
      <CardContent>
        <Typography
          component="p"
          sx={{ fontFamily: serifStack, fontSize: 40, lineHeight: 1.1, color }}
        >
          {count}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {label}
        </Typography>
      </CardContent>
    </Card>
  );
}

function SummaryTiles({ summary }: { summary: GapSummary }) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{ alignItems: "stretch" }}
    >
      <SummaryTile
        count={summary.supported}
        label="Supported by evidence"
        color={brand.tag.green.fg}
      />
      <SummaryTile
        count={summary.undocumented}
        label="Undocumented: you've done it, no file shows it"
        color={brand.tag.orange.fg}
      />
      <SummaryTile
        count={summary.trueGaps}
        label="True gaps"
        color={brand.tag.gray.fg}
      />
    </Stack>
  );
}

const TH_SX = {
  textTransform: "uppercase",
  letterSpacing: 0.6,
  fontSize: 12,
  fontWeight: 600,
  color: "text.secondary",
  borderBottom: `1px solid ${brand.hairline}`,
} as const;

export default async function GapCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role: roleParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const roles = await getTargetRoles(supabase, user.id);

  // Empty state: no target role to check against yet.
  if (roles.length === 0) {
    return (
      <Box sx={PAGE_SX}>
        <Stack spacing={3}>
          <PageHeading
            title="Gap check"
            subtitle="Compare a job description's requirements with your confirmed evidence."
          />
          <Typography variant="body2" color="text.secondary">
            You have no target roles yet. Add one by pasting a job description,
            then come back to see which requirements your evidence supports.
          </Typography>
          <Box>
            <Button href="/dashboard/target-roles/new" variant="contained">
              Add a target role
            </Button>
          </Box>
        </Stack>
      </Box>
    );
  }

  const selected = roles.find((r) => r.id === roleParam) ?? roles[0];
  const requirements = await getRequirementsForRoles(supabase, [selected.id]);
  const assessments = await getAssessmentsForRole(supabase, selected.id);
  const byRequirement = new Map(
    assessments.map((a) => [a.role_requirement_id, a])
  );

  const assessed = requirements
    .map((req) => byRequirement.get(req.id))
    .filter((a) => a !== undefined);
  const summary = summarize(assessed.map((a) => a.verdict));
  const hasAssessments = assessed.length > 0;

  const title = `Gap check: ${selected.title}${
    selected.company ? `, ${selected.company}` : ""
  }`;

  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={4}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <PageHeading
            title={title}
            subtitle="Each requirement from the job description, compared with your confirmed evidence."
          />
          <Button
            href={`/dashboard/target-roles/${selected.id}`}
            variant="outlined"
            sx={{ flexShrink: 0 }}
          >
            Change job description
          </Button>
        </Stack>

        {requirements.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            This role has no requirements yet. Add some on the{" "}
            <Link href={`/dashboard/target-roles/${selected.id}`}>
              role page
            </Link>{" "}
            to run a gap check.
          </Typography>
        ) : (
          <>
            {hasAssessments ? <SummaryTiles summary={summary} /> : null}

            <Stack
              direction="row"
              spacing={2}
              sx={{ alignItems: "center", justifyContent: "space-between" }}
            >
              <Typography variant="body2" color="text.secondary">
                {hasAssessments
                  ? `${assessed.length} of ${requirements.length} requirement${
                      requirements.length === 1 ? "" : "s"
                    } checked.`
                  : "Not checked yet. Run a gap check to classify each requirement against your evidence."}
              </Typography>
              <RunGapCheckButton
                roleId={selected.id}
                hasAssessments={hasAssessments}
              />
            </Stack>

            <TableContainer
              component={Box}
              sx={{
                border: `1px solid ${brand.hairline}`,
                borderRadius: 2,
                bgcolor: "#fff",
              }}
            >
              <Table aria-label="Requirements and their gap status">
                <TableHead>
                  <TableRow>
                    <TableCell sx={TH_SX}>Requirement</TableCell>
                    <TableCell sx={TH_SX}>Status</TableCell>
                    <TableCell sx={TH_SX}>Evidence or next step</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {requirements.map((req) => {
                    const assessment = byRequirement.get(req.id);
                    return (
                      <TableRow key={req.id}>
                        <TableCell
                          sx={{ fontWeight: 600, borderColor: brand.hairline }}
                        >
                          {req.requirement_text}
                        </TableCell>
                        <TableCell sx={{ borderColor: brand.hairline }}>
                          {assessment ? (
                            <StatusChip
                              label={verdictToBucket(assessment.verdict).label}
                              tone={verdictToBucket(assessment.verdict).tone}
                            />
                          ) : (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              component="span"
                            >
                              Not checked
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ borderColor: brand.hairline }}>
                          <EvidenceCellView assessment={assessment} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Stack>
    </Box>
  );
}

function EvidenceCellView({
  assessment,
}: {
  assessment: AssessmentItem | undefined;
}) {
  if (!assessment) {
    return (
      <Typography variant="body2" color="text.secondary" component="span">
        —
      </Typography>
    );
  }
  const cell = evidenceCell({
    verdict: assessment.verdict,
    citations: assessment.citations,
    rationale: assessment.rationale,
  });
  if (cell.kind === "next_step") {
    return cell.href ? (
      <Link href={cell.href} sx={{ color: brand.accent, fontWeight: 500 }}>
        {cell.text} →
      </Link>
    ) : (
      <Typography variant="body2" color="text.secondary" component="span">
        {cell.text}
      </Typography>
    );
  }
  return (
    <Typography
      variant="body2"
      color={cell.kind === "none" ? "text.secondary" : "text.primary"}
      component="span"
    >
      {cell.text}
    </Typography>
  );
}
