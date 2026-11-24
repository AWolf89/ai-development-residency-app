import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { createClient } from "@/lib/supabase/server";
import { collectSignals } from "@/lib/investigations/signals";
import { buildQueue } from "@/lib/investigations/build";
import PageHeading from "@/components/PageHeading";
import InvestigationsView from "./InvestigationsView";

const PAGE_SX = {
  px: { xs: 2, md: 7 },
  py: { xs: 4, md: 6 },
  maxWidth: 900,
} as const;

/**
 * Investigation Queue (MVP 2 Phase 3, §8). A read-only Server Component: it collects the user's
 * outstanding signals (RLS-scoped), derives a prioritised list of what to investigate next with the
 * pure assembler, and renders it. There is no queue table — the list is rebuilt on each visit, so
 * an item disappears the moment its source signal clears. Nothing is written here.
 */
export default async function InvestigationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const signals = await collectSignals(supabase, user.id);
  const items = buildQueue(signals);

  return (
    <Box sx={PAGE_SX}>
      <Stack spacing={3}>
        <PageHeading
          title="Investigations"
          subtitle="What to look into next, in priority order — drawn from your own evidence. Resolve the underlying item and it clears from this list."
        />
        <InvestigationsView items={items} />
      </Stack>
    </Box>
  );
}
