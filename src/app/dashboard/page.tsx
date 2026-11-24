import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/auth/actions";
import { getClaims } from "@/lib/claims/queries";
import { summarize, summaryLine } from "@/lib/claims/presentation";
import {
  getTargetRoles,
  getRequirementsForRoles,
  type TargetRoleListItem,
  type RoleRequirementItem,
} from "@/lib/target-roles/queries";
import { collectHealthInputs } from "@/lib/evidence-health/signals";
import { buildHealth } from "@/lib/evidence-health/build";
import StatusChip from "@/components/StatusChip";
import PageHeading from "@/components/PageHeading";
import { brand, type TagTone } from "@/theme-tokens";
import ProfileForm from "./ProfileForm";
import ClaimsBrowser from "./ClaimsBrowser";
import ExportButton from "./ExportButton";
import EvidenceHealthSection from "./EvidenceHealthSection";

const REQUIREMENT_SOURCE: Record<string, { label: string; tone: TagTone }> = {
  framework: { label: "Framework", tone: "green" },
  onet: { label: "O*NET", tone: "blue" },
  job_description: { label: "Job description", tone: "gray" },
};

const PAGE_SX = {
  px: { xs: 2, md: 7 },
  py: { xs: 4, md: 6 },
  maxWidth: 1180,
} as const;

function TargetRoleCard({
  role,
  requirements,
}: {
  role: TargetRoleListItem;
  requirements: RoleRequirementItem[];
}) {
  const created = new Date(role.created_at).toLocaleDateString();
  return (
    <Card
      variant="outlined"
      sx={{ borderLeft: `4px solid ${brand.tag.blue.fg}` }}
    >
      <CardActionArea
        href={`/dashboard/target-roles/${role.id}`}
        aria-label={`Edit target role: ${role.title}`}
      >
        <CardContent>
          <Typography variant="subtitle1" component="h3">
            {role.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Saved {created} · {requirements.length} requirement
            {requirements.length === 1 ? "" : "s"}
          </Typography>
          <Stack
            component="ul"
            spacing={0.5}
            sx={{ listStyle: "none", m: 0, mt: 1, p: 0 }}
          >
            {requirements.map((req) => (
              <Stack
                key={req.id}
                component="li"
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", gap: 1 }}
              >
                {req.source && REQUIREMENT_SOURCE[req.source] ? (
                  <StatusChip
                    label={REQUIREMENT_SOURCE[req.source].label}
                    tone={REQUIREMENT_SOURCE[req.source].tone}
                  />
                ) : null}
                <Typography variant="body2">{req.requirement_text}</Typography>
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Route guard: signed-out visitors never see this page.
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  // The user's claims — their confirmed decision records, assembled with status, sources,
  // history and usage. RLS guarantees only their own rows come back.
  const claims = await getClaims(supabase, user.id);
  const summary = summarize(claims);

  // Evidence-health indicators (plan §6.6): a derive-on-read projection over existing data —
  // claim lifecycle, the investigation queue, projects, and gap coverage. No single score.
  const health = buildHealth(await collectHealthInputs(supabase, user.id));

  // Target roles stay reachable as a secondary section (used by the Gap Check).
  const targetRoles = await getTargetRoles(supabase, user.id);
  const roleRequirements = await getRequirementsForRoles(
    supabase,
    targetRoles.map((r) => r.id)
  );
  const requirementsByRole = new Map<string, RoleRequirementItem[]>();
  for (const req of roleRequirements) {
    const list = requirementsByRole.get(req.target_role_id) ?? [];
    list.push(req);
    requirementsByRole.set(req.target_role_id, list);
  }

  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={4}>
        <PageHeading
          title="Your evidence profile"
          subtitle={summaryLine(summary)}
          action={
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap" }}>
              <Button
                href="/dashboard/decision-records/new"
                variant="contained"
              >
                Add a record
              </Button>
              <ExportButton />
              <Box component="form" action={logout}>
                <Button type="submit" variant="text">
                  Log out
                </Button>
              </Box>
            </Stack>
          }
        />

        <EvidenceHealthSection health={health} />

        <Divider />

        {claims.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No claims yet. Add a decision record — from an interview, an
            uploaded artifact, or your own recollection — and it appears here as
            a claim, tagged by how well it is backed.
          </Typography>
        ) : (
          <ClaimsBrowser claims={claims} />
        )}

        <Divider />

        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            Display name
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Saved to your private profile. Log out and back in — it will still
            be here, and no other user can see it.
          </Typography>
          <ProfileForm initialDisplayName={profile?.display_name ?? ""} />
        </Stack>

        <Divider />

        <Stack spacing={2}>
          <Stack
            direction="row"
            sx={{
              justifyContent: "space-between",
              alignItems: "center",
              gap: 2,
            }}
          >
            <Typography variant="h6" component="h2">
              Your target roles
            </Typography>
            <Button href="/dashboard/target-roles/new" variant="contained">
              Add a target role
            </Button>
          </Stack>

          {targetRoles.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No target roles yet. Add one by pasting a job description to see
              which requirements your evidence can support.
            </Typography>
          ) : (
            <Stack
              spacing={1.5}
              component="ul"
              sx={{ listStyle: "none", m: 0, p: 0 }}
            >
              {targetRoles.map((role) => (
                <Box component="li" key={role.id}>
                  <TargetRoleCard
                    role={role}
                    requirements={requirementsByRole.get(role.id) ?? []}
                  />
                </Box>
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}
