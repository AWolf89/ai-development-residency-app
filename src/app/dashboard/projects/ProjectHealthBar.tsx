import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { brand } from "@/theme-tokens";
import {
  HEALTH_SEGMENT_COLORS,
  type ProjectHealth,
} from "@/lib/projects/health";

/**
 * The claim-health bar shared by the Projects list and the project hub (plan §6.2). A logic-free
 * presentational component (no hooks), so it renders from either a Server or a Client Component.
 * The bar is an accessible image whose label states the counts; an empty project shows a neutral
 * track and "No claims yet".
 */
export function ProjectHealthBar({
  health,
  width,
}: {
  health: ProjectHealth;
  width?: number | string;
}) {
  const { supported, needEvidence, challenged, claims } = health;
  const label = `${supported} supported, ${needEvidence} need evidence, ${challenged} challenged`;

  if (claims === 0) {
    return (
      <Box
        aria-label="No claims yet"
        sx={{ height: 8, borderRadius: 999, bgcolor: brand.hairline, width }}
      />
    );
  }

  const segments = [
    {
      key: "supported",
      value: supported,
      color: HEALTH_SEGMENT_COLORS.supported,
    },
    {
      key: "needEvidence",
      value: needEvidence,
      color: HEALTH_SEGMENT_COLORS.needEvidence,
    },
    {
      key: "challenged",
      value: challenged,
      color: HEALTH_SEGMENT_COLORS.challenged,
    },
  ];

  return (
    <Box
      role="img"
      aria-label={label}
      sx={{
        display: "flex",
        height: 8,
        borderRadius: 999,
        overflow: "hidden",
        bgcolor: brand.hairline,
        width,
      }}
    >
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <Box
            key={s.key}
            aria-hidden="true"
            sx={{ flexGrow: s.value, bgcolor: s.color }}
          />
        ))}
    </Box>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        bgcolor: color,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

/** The "N supported · N need evidence · N challenged" legend under the bar. */
export function ProjectHealthLegend({ health }: { health: ProjectHealth }) {
  const items = [
    {
      key: "supported",
      text: `${health.supported} supported`,
      color: HEALTH_SEGMENT_COLORS.supported,
    },
    {
      key: "needEvidence",
      text: `${health.needEvidence} need evidence`,
      color: HEALTH_SEGMENT_COLORS.needEvidence,
    },
    {
      key: "challenged",
      text: `${health.challenged} challenged`,
      color: HEALTH_SEGMENT_COLORS.challenged,
    },
  ];
  return (
    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", gap: 1 }}>
      {items.map((i) => (
        <Stack
          key={i.key}
          direction="row"
          spacing={0.75}
          sx={{ alignItems: "center" }}
        >
          <Dot color={i.color} />
          <Typography variant="caption" color="text.secondary">
            {i.text}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}
