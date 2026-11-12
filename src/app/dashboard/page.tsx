import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/auth/actions";
import {
  getDecisionRecords,
  type DecisionRecordListItem,
} from "@/lib/decision-records/queries";
import {
  getTargetRoles,
  getRequirementsForRoles,
  type TargetRoleListItem,
  type RoleRequirementItem,
} from "@/lib/target-roles/queries";
import ProfileForm from "./ProfileForm";

const SOURCE_CHIP: Record<string, string> = {
  artifact: "Artifact",
  self_reported: "Self-reported",
};

const REQUIREMENT_SOURCE_CHIP: Record<string, string> = {
  framework: "Framework",
  onet: "O*NET",
  job_description: "Job description",
};

function TargetRoleCard({
  role,
  requirements,
}: {
  role: TargetRoleListItem;
  requirements: RoleRequirementItem[];
}) {
  const created = new Date(role.created_at).toLocaleDateString();
  return (
    <Card variant="outlined">
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
                {req.source ? (
                  <Chip
                    label={REQUIREMENT_SOURCE_CHIP[req.source] ?? req.source}
                    size="small"
                    color={req.source === "framework" ? "primary" : "default"}
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

function RecordCard({ record }: { record: DecisionRecordListItem }) {
  const created = new Date(record.created_at).toLocaleDateString();
  return (
    <Card variant="outlined">
      <CardActionArea
        href={`/dashboard/decision-records/${record.id}`}
        aria-label={`Edit decision record: ${record.title}`}
      >
        <CardContent>
          <Stack
            direction="row"
            sx={{
              justifyContent: "space-between",
              alignItems: "center",
              gap: 1,
            }}
          >
            <Typography variant="subtitle1" component="h3">
              {record.title}
            </Typography>
            {record.source ? (
              <Chip
                label={SOURCE_CHIP[record.source] ?? record.source}
                size="small"
                color={record.source === "artifact" ? "primary" : "default"}
              />
            ) : null}
          </Stack>
          {record.decision ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {record.decision}
            </Typography>
          ) : null}
          <Typography variant="caption" color="text.secondary">
            Saved {created}
          </Typography>
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

  // Read this user's own profile row. RLS ensures it can only be their own.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  // The user's saved decision records (AC5): they persist and appear here on
  // return. RLS guarantees only their own rows come back (AC7).
  const records = await getDecisionRecords(supabase, user.id);

  // The user's saved target roles (AC4) and their requirements, grouped by role.
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
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={4}>
        <Stack
          direction="row"
          sx={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <Typography variant="h4" component="h1">
            Your account
          </Typography>
          <Box component="form" action={logout}>
            <Button type="submit" variant="outlined">
              Log out
            </Button>
          </Box>
        </Stack>

        <Typography color="text.secondary">
          Signed in as <strong>{user.email}</strong>
        </Typography>

        <Divider />

        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            Display name
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This is saved to your private profile. Log out and back in — it will
            still be here, and no other user can see it.
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
              Your decision records
            </Typography>
            <Button href="/dashboard/decision-records/new" variant="contained">
              Add a record
            </Button>
          </Stack>

          {records.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No decision records yet. Add one to capture the reasoning behind a
              decision from your work.
            </Typography>
          ) : (
            <Stack
              spacing={1.5}
              component="ul"
              sx={{ listStyle: "none", m: 0, p: 0 }}
            >
              {records.map((record) => (
                <Box component="li" key={record.id}>
                  <RecordCard record={record} />
                </Box>
              ))}
            </Stack>
          )}
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
    </Container>
  );
}
