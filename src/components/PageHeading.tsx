import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { serifStack } from "@/theme-tokens";

/**
 * The page header used across every signed-in page, matching the Figma
 * prototype's editorial look: a large serif title, a muted subtitle line, and
 * an optional action (e.g. a button) aligned to the right on wider screens.
 *
 * Server-safe (no "use client"): it only renders markup and reads design
 * tokens, so Server Components can use it directly.
 */
export default function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={2}
      sx={{
        justifyContent: "space-between",
        alignItems: { xs: "flex-start", md: "center" },
      }}
    >
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        <Typography
          component="h1"
          sx={{
            fontFamily: serifStack,
            fontSize: { xs: 32, md: 44 },
            lineHeight: 1.15,
            m: 0,
          }}
        >
          {title}
        </Typography>
        {subtitle ? (
          <Typography color="text.secondary">{subtitle}</Typography>
        ) : null}
      </Stack>
      {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
    </Stack>
  );
}
