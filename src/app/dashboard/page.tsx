import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/auth/actions";
import ProfileForm from "./ProfileForm";

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
      </Stack>
    </Container>
  );
}
