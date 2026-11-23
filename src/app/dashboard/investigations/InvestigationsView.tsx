import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type {
  InvestigationItem,
  InvestigationKind,
} from "@/lib/investigations/types";

type ChipSpec = { label: string; color: "warning" | "info" | "default" };

const KIND_CHIP: Record<InvestigationKind, ChipSpec> = {
  document_conflict: { label: "Conflict", color: "warning" },
  overclaim_flag: { label: "Overclaim", color: "warning" },
  unsupported_claim: { label: "No evidence", color: "default" },
  unverified_requirement: { label: "Unverified", color: "default" },
  missing_info: { label: "Missing info", color: "default" },
  link_suggestion: { label: "Overlap", color: "info" },
  unreviewed_file: { label: "Needs review", color: "default" },
  unfinished_interview: { label: "Unfinished", color: "default" },
};

/**
 * Presentation for the Investigation Queue (MVP 2 Phase 3). Display-only Server Component: it
 * renders the already-prioritised items as cards, each with its kind, what's unknown, why it
 * matters, the affected subject, and one next-action deep-link. An empty queue shows an honest
 * empty state and invents nothing (AC4). Links pass `href` so the theme's LinkBehaviour wires
 * Next navigation (never component={NextLink} from a Server Component).
 */
export default function InvestigationsView({
  items,
}: {
  items: InvestigationItem[];
}) {
  if (items.length === 0) {
    return (
      <Card variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" component="p" gutterBottom>
          Nothing to investigate right now
        </Typography>
        <Typography variant="body2" color="text.secondary">
          When a file needs review, a claim lacks evidence, documents disagree,
          or an interview is left unfinished, it will appear here with a next
          step.
        </Typography>
      </Card>
    );
  }

  return (
    <Stack spacing={1.5} component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
      {items.map((item) => {
        const chip = KIND_CHIP[item.kind];
        return (
          <Card key={item.id} variant="outlined" component="li" sx={{ p: 2 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{
                alignItems: { sm: "center" },
                justifyContent: "space-between",
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", mb: 0.5 }}
                >
                  <Chip size="small" label={chip.label} color={chip.color} />
                  <Typography variant="subtitle2" component="h2">
                    {item.title}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {item.detail}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {item.subjectLabel}
                </Typography>
              </Box>
              <Button
                variant="outlined"
                size="small"
                href={item.action.href}
                sx={{
                  flexShrink: 0,
                  alignSelf: { xs: "flex-start", sm: "center" },
                }}
              >
                {item.action.label}
              </Button>
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}
