import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { serifStack, brand } from "@/theme-tokens";
import type { EvidenceHealth, RoleCoverage } from "@/lib/evidence-health/types";

/**
 * Presentation for Evidence-health indicators (MVP 2 Phase 3, plan §6.6). Display-only Server
 * Component: it renders the already-computed indicators and role coverage as cards, each with a
 * deep-link (AC3). No single overall score (AC2). Links pass `href` so the theme's LinkBehaviour
 * wires Next navigation (never component={NextLink} from a Server Component).
 */
export default function EvidenceHealthSection({
  health,
}: {
  health: EvidenceHealth;
}) {
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6" component="h2">
          Evidence health
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Specific, honest indicators of how well-supported your profile is —
          not a single score. Each links to the records behind it.
        </Typography>
      </Box>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: "stretch", flexWrap: "wrap" }}
      >
        {health.indicators.map((indicator) => (
          <Card
            key={indicator.key}
            variant="outlined"
            sx={{
              flex: 1,
              minWidth: 220,
              borderLeft: `4px solid ${brand.tag[indicator.tone].fg}`,
            }}
          >
            <CardContent>
              <Stack sx={{ height: "100%" }} spacing={1}>
                <Typography
                  component="p"
                  sx={{
                    fontFamily: serifStack,
                    fontSize: 40,
                    lineHeight: 1.1,
                    color: brand.tag[indicator.tone].fg,
                  }}
                >
                  {indicator.count}
                </Typography>
                <Typography variant="subtitle2" component="h3">
                  {indicator.label}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ flexGrow: 1 }}
                >
                  {indicator.detail}
                </Typography>
                <Box>
                  <Button
                    size="small"
                    variant="text"
                    href={indicator.action.href}
                  >
                    {indicator.action.label} →
                  </Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {health.roleCoverage.length > 0 ? (
        <Stack spacing={1}>
          <Typography variant="subtitle2" component="h3" sx={{ mt: 1 }}>
            Target-role coverage
          </Typography>
          <Stack
            component="ul"
            spacing={1}
            sx={{ listStyle: "none", m: 0, p: 0 }}
          >
            {health.roleCoverage.map((role) => (
              <Box component="li" key={role.roleId}>
                <RoleCoverageRow role={role} />
              </Box>
            ))}
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  );
}

function coverageLine(role: RoleCoverage): string {
  if (role.assessed === 0) {
    return "Not checked yet — run a gap check to see coverage.";
  }
  return `${role.supported} of ${role.total} requirement${
    role.total === 1 ? "" : "s"
  } backed by your evidence.`;
}

function RoleCoverageRow({ role }: { role: RoleCoverage }) {
  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" component="p">
            {role.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {coverageLine(role)}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          href={role.href}
          sx={{ flexShrink: 0, alignSelf: { xs: "flex-start", sm: "center" } }}
        >
          {role.assessed === 0 ? "Run gap check" : "View gap check"}
        </Button>
      </Stack>
    </Card>
  );
}
