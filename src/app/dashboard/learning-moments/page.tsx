import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { getFiles } from "@/lib/files/queries";
import { getTargetRoles } from "@/lib/target-roles/queries";
import { serifStack } from "@/theme-tokens";
import CaptureForm from "./CaptureForm";

const PAGE_SX = {
  px: { xs: 2, md: 7 },
  py: { xs: 4, md: 6 },
  maxWidth: 1180,
} as const;

/**
 * Learning Moment Capture (ADR-0018). A lighter, standalone capture — not the Reasoning
 * Interview — for learning-agility evidence. The Server Component loads the user's files and
 * target roles (RLS-scoped) so the form can offer an optional artifact/role link; all capture
 * logic lives in the tested pure modules behind the Server Action.
 */
export default async function LearningMomentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [files, roles] = await Promise.all([
    getFiles(supabase, user.id),
    getTargetRoles(supabase, user.id),
  ]);

  const fileOptions = files.map((f) => ({ id: f.id, file_name: f.file_name }));
  const roleOptions = roles.map((r) => ({
    id: r.id,
    title: r.title,
    company: r.company,
  }));

  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={4}>
        <Stack spacing={1}>
          <Typography
            component="h1"
            sx={{ fontFamily: serifStack, fontSize: { xs: 30, md: 44 }, m: 0 }}
          >
            Capture a learning moment
          </Typography>
          <Typography color="text.secondary">
            Show how you learn: a time you got up to speed fast, a moment
            something clicked, a change of course, or a skill you brought from a
            past role. Each one becomes evidence on your profile.
          </Typography>
        </Stack>
        <CaptureForm files={fileOptions} roles={roleOptions} />
      </Stack>
    </Box>
  );
}
