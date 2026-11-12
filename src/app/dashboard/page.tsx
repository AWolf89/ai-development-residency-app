import { redirect } from "next/navigation";
import NextLink from "next/link";
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
import ProfileForm from "./ProfileForm";

const SOURCE_CHIP: Record<string, string> = {
  artifact: "Artifact",
  self_reported: "Self-reported",
};

function RecordCard({ record }: { record: DecisionRecordListItem }) {
  const created = new Date(record.created_at).toLocaleDateString();
  return (
    <Card variant="outlined">
      <CardActionArea
        component={NextLink}
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
            <Button
              component={NextLink}
              href="/dashboard/decision-records/new"
              variant="contained"
            >
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
      </Stack>
    </Container>
  );
}
