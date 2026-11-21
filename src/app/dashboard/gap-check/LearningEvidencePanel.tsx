import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import StatusChip from "@/components/StatusChip";
import { presentationFor } from "@/lib/learning-moments/presentation";
import type { LearningMomentRecord } from "@/lib/learning-moments/gap-evidence";
import { serifStack, brand } from "@/theme-tokens";

/**
 * "You can close these" — learning-agility evidence shown beside a role's true gaps (card:
 * Learning Evidence in the Gap Check). It frames the user's own learning moments as evidence a
 * gap can be CLOSED, never as proof of the skill itself (AC2). A pure presentational Server
 * Component: it renders only what `selectGapLearningEvidence` passed, and the caller renders it
 * only when there are true gaps and at least one record — so nothing is invented (AC3).
 */
function MomentCard({ moment }: { moment: LearningMomentRecord }) {
  const kind = presentationFor(moment.kind);
  return (
    <Card
      component="li"
      variant="outlined"
      sx={{ bgcolor: "#fff", listStyle: "none" }}
    >
      <CardContent>
        <Stack spacing={1}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <StatusChip label={kind.label} tone="blue" />
            {moment.kind === "speed" && moment.duration ? (
              <Typography variant="body2" color="text.secondary">
                in {moment.duration}
              </Typography>
            ) : null}
          </Stack>
          <Typography sx={{ fontWeight: 600 }}>{moment.context}</Typography>
          <Box>
            <Typography
              component="span"
              sx={{ fontWeight: 700, fontSize: 13, color: "text.secondary" }}
            >
              {kind.shiftLabel}:{" "}
            </Typography>
            <Typography component="span" sx={{ fontSize: 15 }}>
              {moment.shift}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {moment.result}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function LearningEvidencePanel({
  evidence,
}: {
  evidence: LearningMomentRecord[];
}) {
  return (
    <Card
      variant="outlined"
      sx={{ bgcolor: brand.tag.green.bg, borderColor: brand.tag.green.bg }}
      component="section"
      aria-labelledby="learning-evidence-heading"
    >
      <CardContent>
        <Stack spacing={2}>
          <Stack spacing={0.5}>
            <Typography
              id="learning-evidence-heading"
              component="h2"
              sx={{
                fontFamily: serifStack,
                fontSize: { xs: 22, md: 26 },
                m: 0,
              }}
            >
              You can close these
            </Typography>
            <Typography variant="body2" color="text.secondary">
              A gap today isn&rsquo;t a dealbreaker. Here&rsquo;s evidence of
              how quickly you&rsquo;ve learned before — it shows learning
              agility, not the skill itself.
            </Typography>
          </Stack>
          <Stack component="ul" spacing={1.5} sx={{ m: 0, p: 0 }}>
            {evidence.map((moment) => (
              <MomentCard key={moment.id} moment={moment} />
            ))}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
