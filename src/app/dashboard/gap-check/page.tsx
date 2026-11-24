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
  verdictToCategory,
  summarize,
  evidenceCell,
  selectActiveRole,
  type GapSummary,
} from "@/lib/gap/presentation";
import { getLearningMoments } from "@/lib/learning-moments/queries";
import { selectGapLearningEvidence } from "@/lib/learning-moments/gap-evidence";
import StatusChip from "@/components/StatusChip";
import PageHeading from "@/components/PageHeading";
import { serifStack, brand } from "@/theme-tokens";
import RunGapCheckButton from "./RunGapCheckButton";
import RolePicker from "./RolePicker";
import InvestigateDialog from "./InvestigateDialog";
import LearningEvidencePanel from "./LearningEvidencePanel";

/** Verdicts the Evidence Investigation Agent can deepen (ADR-0017); `met` has nothing to chase. */
const INVESTIGABLE_VERDICTS = new Set(["gap", "unknown", "partial"]);

const PAGE_SX = {
  px: { xs: 2, md: 7 },
  py: { xs: 4, md: 6 },
  maxWidth: 1180,
} as const;

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
        count={summary.demonstrated}
        label="Demonstrated by your evidence"
        color={brand.tag.green.fg}
      />
      <SummaryTile
        count={summary.partiallyDemonstrated}
        label="Partially demonstrated"
        color={brand.tag.blue.fg}
      />
      <SummaryTile
        count={summary.unverified}
        label="Unverified: no evidence found yet — worth investigating"
        color={brand.tag.orange.fg}
      />
      <SummaryTile
        count={summary.development}
        label="Development opportunities"
        color={brand.tag.gray.fg}
      />
    </Stack>
  );
}

/**
 * The product's core framing (ADR-0024, plan §6.5): a missing piece of evidence is not
 * proof of a missing skill. Unverified requirements route to investigation, never to a
 * course or a hiring verdict.
 */
function EvidenceNotSkillNote() {
  return (
    <Card
      variant="outlined"
      sx={{ borderColor: brand.tag.orange.fg, bgcolor: brand.tag.orange.bg }}
    >
      <CardContent>
        <Typography variant="body2" sx={{ color: brand.tag.orange.fg }}>
          <strong>Missing evidence isn&apos;t proof of a missing skill.</strong>{" "}
          An <em>Unverified</em> requirement just means nothing in your evidence
          covers it yet — investigate what you&apos;ve actually done before
          treating it as a gap. We never read these as a hiring verdict.
        </Typography>
      </CardContent>
    </Card>
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

  // roles is non-empty here (the no-roles case returned above), so this is defined.
  const selected = selectActiveRole(roles, roleParam) ?? roles[0];
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

  // Learning Evidence in the Gap Check: when there are true gaps, surface the user's own
  // learning-agility records as evidence the gaps can be closed. Only queried when it is needed,
  // and the panel renders only if there are relevant records — nothing is invented (AC3).
  const learningEvidence =
    summary.development > 0
      ? selectGapLearningEvidence(
          await getLearningMoments(supabase, user.id),
          selected.id
        )
      : [];

  const title = `Gap check: ${selected.title}${
    selected.company ? `, ${selected.company}` : ""
  }`;

  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={4}>
        <PageHeading
          title={title}
          subtitle="Each requirement from the job description, compared with your confirmed evidence."
          action={
            <Button
              href={`/dashboard/target-roles/${selected.id}`}
              variant="outlined"
            >
              Change job description
            </Button>
          }
        />

        {roles.length > 1 ? (
          <RolePicker roles={roles} selectedId={selected.id} />
        ) : null}

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
            {hasAssessments ? (
              <>
                <SummaryTiles summary={summary} />
                <EvidenceNotSkillNote />
              </>
            ) : null}

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
                              label={
                                verdictToCategory(assessment.verdict).label
                              }
                              tone={verdictToCategory(assessment.verdict).tone}
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
                          <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
                            <EvidenceCellView assessment={assessment} />
                            {assessment &&
                            INVESTIGABLE_VERDICTS.has(assessment.verdict) ? (
                              <InvestigateDialog
                                requirement={{
                                  id: req.id,
                                  text: req.requirement_text,
                                }}
                                targetRoleId={selected.id}
                              />
                            ) : null}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {learningEvidence.length > 0 ? (
              <LearningEvidencePanel evidence={learningEvidence} />
            ) : null}
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
