"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import StatusChip from "@/components/StatusChip";
import { brand } from "@/theme-tokens";
import {
  DISPLAY_STATUS_META,
  HEALTH_SEGMENT_COLORS,
  type ProjectCardData,
  type ProjectDisplayStatus,
} from "@/lib/projects/health";

type Filter = "all" | ProjectDisplayStatus;

const FILTER_ORDER: Filter[] = [
  "all",
  "needs_attention",
  "in_progress",
  "complete",
];

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  needs_attention: "Needs attention",
  in_progress: "In progress",
  complete: "Complete",
};

export default function ProjectsList({ cards }: { cards: ProjectCardData[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: cards.length,
      needs_attention: 0,
      in_progress: 0,
      complete: 0,
    };
    for (const card of cards) {
      c[card.status] += 1;
    }
    return c;
  }, [cards]);

  const visible = useMemo(
    () => (filter === "all" ? cards : cards.filter((c) => c.status === filter)),
    [cards, filter]
  );

  return (
    <Stack spacing={2.5}>
      <Stack
        direction="row"
        spacing={1}
        role="group"
        aria-label="Filter projects by status"
        sx={{ flexWrap: "wrap", gap: 1 }}
      >
        {FILTER_ORDER.map((key) => {
          const active = filter === key;
          return (
            <Chip
              key={key}
              label={`${FILTER_LABEL[key]} ${counts[key]}`}
              onClick={() => setFilter(key)}
              aria-pressed={active}
              variant={active ? "filled" : "outlined"}
              sx={{
                fontWeight: active ? 600 : 400,
                bgcolor: active ? brand.sidebarBg : "transparent",
                color: active ? "#fff" : "text.primary",
                borderColor: brand.hairline,
                "&:hover": {
                  bgcolor: active ? brand.sidebarBg : "rgba(0,0,0,0.04)",
                },
              }}
            />
          );
        })}
      </Stack>

      {visible.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No projects in this view.
        </Typography>
      ) : (
        <Box
          component="ul"
          sx={{
            listStyle: "none",
            m: 0,
            p: 0,
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          }}
        >
          {visible.map((card) => (
            <Box component="li" key={card.id}>
              <ProjectCard card={card} />
            </Box>
          ))}
        </Box>
      )}
    </Stack>
  );
}

function ProjectCard({ card }: { card: ProjectCardData }) {
  const meta = DISPLAY_STATUS_META[card.status];
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardActionArea
        href={`/dashboard/projects/${card.id}`}
        aria-label={`Open project: ${card.name}`}
        sx={{ height: "100%", alignItems: "stretch" }}
      >
        <CardContent>
          <Stack spacing={1.5}>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="subtitle1" component="h3">
                {card.name}
              </Typography>
              <StatusChip label={meta.label} tone={meta.tone} />
            </Stack>

            {card.subtitle ? (
              <Typography variant="caption" color="text.secondary">
                {card.subtitle}
              </Typography>
            ) : null}

            <HealthBar card={card} />

            <HealthLegend card={card} />

            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", justifyContent: "space-between" }}
            >
              <Typography variant="caption" color="text.secondary">
                {card.health.claims} claim
                {card.health.claims === 1 ? "" : "s"} · {card.sourceCount}{" "}
                source
                {card.sourceCount === 1 ? "" : "s"}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {card.health.toInvestigate > 0 ? (
                  <StatusChip
                    label={`${card.health.toInvestigate} to investigate`}
                    tone="orange"
                  />
                ) : null}
                <Typography
                  variant="body2"
                  sx={{ color: brand.accent, fontWeight: 600 }}
                >
                  Open →
                </Typography>
              </Stack>
            </Stack>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

function HealthBar({ card }: { card: ProjectCardData }) {
  const { supported, needEvidence, challenged, claims } = card.health;
  const label = `${supported} supported, ${needEvidence} need evidence, ${challenged} challenged`;

  if (claims === 0) {
    return (
      <Box
        aria-label="No claims yet"
        sx={{
          height: 8,
          borderRadius: 999,
          bgcolor: brand.hairline,
        }}
      />
    );
  }

  const segments: { key: string; value: number; color: string }[] = [
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
      }}
    >
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <Box
            key={s.key}
            sx={{ flexGrow: s.value, bgcolor: s.color }}
            aria-hidden="true"
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

function HealthLegend({ card }: { card: ProjectCardData }) {
  const { supported, needEvidence, challenged } = card.health;
  const items = [
    {
      key: "supported",
      text: `${supported} supported`,
      color: HEALTH_SEGMENT_COLORS.supported,
    },
    {
      key: "needEvidence",
      text: `${needEvidence} need evidence`,
      color: HEALTH_SEGMENT_COLORS.needEvidence,
    },
    {
      key: "challenged",
      text: `${challenged} challenged`,
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
