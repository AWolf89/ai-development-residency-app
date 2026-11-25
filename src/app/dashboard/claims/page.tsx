import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { getClaims } from "@/lib/claims/queries";
import { summarize, summaryLine } from "@/lib/claims/presentation";
import PageHeading from "@/components/PageHeading";
import EvidenceLibraryTabs from "@/components/EvidenceLibraryTabs";
import ClaimsBrowser from "../ClaimsBrowser";

const PAGE_SX = {
  px: { xs: 2, md: 7 },
  py: { xs: 4, md: 6 },
  maxWidth: 1180,
} as const;

/**
 * Dedicated "Review claims" view (the sidebar's claims destination). It reuses the same
 * server-assembled claims and the interactive `ClaimsBrowser` as the profile page, but
 * focused on reviewing evidence rather than editing profile/target-role settings. Keeps its
 * own auth guard like every other signed-in page.
 */
export default async function ReviewClaimsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Route guard: signed-out visitors never see this page.
  if (!user) {
    redirect("/login");
  }

  // RLS guarantees only the signed-in user's own confirmed records come back.
  const claims = await getClaims(supabase, user.id);
  const summary = summarize(claims);

  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={4}>
        <EvidenceLibraryTabs />
        <PageHeading
          title="Review claims"
          subtitle={summaryLine(summary)}
          action={
            <Button href="/dashboard/decision-records/new" variant="contained">
              Add a record
            </Button>
          }
        />

        {claims.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No claims yet. Add a decision record — from an interview, an
            uploaded artifact, or your own recollection — and it appears here as
            a claim, tagged by how well it is backed.
          </Typography>
        ) : (
          <ClaimsBrowser claims={claims} />
        )}
      </Stack>
    </Box>
  );
}
