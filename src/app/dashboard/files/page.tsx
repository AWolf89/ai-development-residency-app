import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { getFiles } from "@/lib/files/queries";
import { mapFileRowToView } from "@/lib/files/mappers";
import FilesManager from "./FilesManager";

const PAGE_SX = {
  px: { xs: 2, md: 7 },
  py: { xs: 4, md: 6 },
  maxWidth: 1180,
} as const;

export default async function FilesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Route guard: signed-out visitors never see this page.
  if (!user) {
    redirect("/login");
  }

  // RLS guarantees only the signed-in user's own files come back.
  const rows = await getFiles(supabase, user.id);
  const files = rows.map(mapFileRowToView);

  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={4}>
        <Stack spacing={1}>
          <Typography variant="h4" component="h1">
            Upload files
          </Typography>
          <Typography color="text.secondary">
            Upload documents and images you want to cite as evidence — PDFs,
            images, text, or Word documents, up to 10&nbsp;MB each. Only you can
            see your files.
          </Typography>
        </Stack>

        <Divider />

        <FilesManager userId={user.id} files={files} />
      </Stack>
    </Box>
  );
}
