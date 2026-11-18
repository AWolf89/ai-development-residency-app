"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import StatusChip from "@/components/StatusChip";
import { brand } from "@/theme-tokens";
import {
  buildFacetTabs,
  filterClaims,
  statusDisplay,
  usageLine,
  type Facet,
} from "@/lib/claims/presentation";
import type { Claim } from "@/lib/claims/types";

const UPPER_LABEL_SX = {
  textTransform: "uppercase",
  letterSpacing: 0.8,
  fontSize: 12,
  fontWeight: 700,
  color: brand.tag.blue.fg,
} as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function ClaimCard({
  claim,
  selected,
  onSelect,
}: {
  claim: Claim;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = statusDisplay(claim.status);
  return (
    <Card
      variant="outlined"
      sx={{
        borderLeft: `4px solid ${brand.tag[status.tone].fg}`,
        bgcolor: selected ? brand.tag.blue.bg : "#fff",
      }}
    >
      <CardContent
        component="button"
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        sx={{
          display: "block",
          width: "100%",
          textAlign: "left",
          border: "none",
          bgcolor: "transparent",
          cursor: "pointer",
          font: "inherit",
          color: "inherit",
        }}
      >
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 1,
          }}
        >
          <Typography sx={{ fontWeight: 600, fontSize: 16 }}>
            {claim.title}
          </Typography>
          <StatusChip label={status.label} tone={status.tone} />
        </Stack>
        {claim.decision ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {claim.decision}
          </Typography>
        ) : null}
        <Typography variant="caption" color="text.secondary">
          {claim.sourceCount} source{claim.sourceCount === 1 ? "" : "s"} · saved{" "}
          {formatDate(claim.createdAt)}
        </Typography>
      </CardContent>
    </Card>
  );
}

function HistoryPanel({ claim }: { claim: Claim | null }) {
  if (claim === null) {
    return (
      <Typography variant="body2" color="text.secondary">
        No claims in this facet yet.
      </Typography>
    );
  }
  const status = statusDisplay(claim.status);
  const usage = usageLine(claim);
  return (
    <Stack spacing={1.5}>
      <Typography sx={UPPER_LABEL_SX}>History: {claim.title}</Typography>
      <StatusChip label={status.label} tone={status.tone} />
      <Typography variant="body2" color="text.secondary">
        {claim.sourceCount} supporting file{claim.sourceCount === 1 ? "" : "s"}
      </Typography>
      <Stack
        component="ul"
        spacing={0.5}
        sx={{ listStyle: "none", m: 0, p: 0 }}
      >
        {claim.history.length > 0 ? (
          claim.history.map((entry) => (
            <Typography
              key={entry.versionNumber}
              component="li"
              variant="body2"
            >
              v{entry.versionNumber} · {formatDate(entry.createdAt)}
            </Typography>
          ))
        ) : (
          <Typography component="li" variant="body2" color="text.secondary">
            v1 · {formatDate(claim.createdAt)} (no later edits)
          </Typography>
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {usage ?? "Not used anywhere yet."}
      </Typography>
      <Link href={`/dashboard/decision-records/${claim.id}`} variant="body2">
        Edit claim
      </Link>
    </Stack>
  );
}

/**
 * The interactive evidence profile (ADR-0015): facet tabs filter the claim list; selecting a
 * claim shows its history and "used in" in the side panel. All data is assembled server-side
 * and passed in; this component only manages the selected facet and claim (per-viewer UI state).
 */
export default function ClaimsBrowser({ claims }: { claims: Claim[] }) {
  const [facet, setFacet] = useState<Facet>("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    claims[0]?.id ?? null
  );

  const tabs = useMemo(() => buildFacetTabs(claims), [claims]);
  const visible = useMemo(() => filterClaims(claims, facet), [claims, facet]);
  const activeClaim =
    visible.find((c) => c.id === selectedId) ?? visible[0] ?? null;

  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={3}
      sx={{ alignItems: "flex-start" }}
    >
      <Stack spacing={2} sx={{ flex: 1, minWidth: 0, width: "100%" }}>
        <Tabs
          value={facet}
          onChange={(_, value: Facet) => setFacet(value)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Filter claims by facet"
        >
          {tabs.map((tab) => (
            <Tab
              key={tab.key}
              value={tab.key}
              label={`${tab.label} (${tab.count})`}
            />
          ))}
        </Tabs>

        {visible.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No claims filed under this facet yet.
          </Typography>
        ) : (
          <Stack
            component="ul"
            spacing={1.5}
            sx={{ listStyle: "none", m: 0, p: 0 }}
          >
            {visible.map((claim) => (
              <Box component="li" key={claim.id}>
                <ClaimCard
                  claim={claim}
                  selected={activeClaim?.id === claim.id}
                  onSelect={() => setSelectedId(claim.id)}
                />
              </Box>
            ))}
          </Stack>
        )}
      </Stack>

      <Card
        variant="outlined"
        sx={{
          width: { xs: "100%", md: 320 },
          flexShrink: 0,
          position: { md: "sticky" },
          top: { md: 24 },
        }}
      >
        <CardContent>
          <HistoryPanel claim={activeClaim} />
        </CardContent>
      </Card>
    </Stack>
  );
}
