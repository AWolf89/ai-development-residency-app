"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { visuallyHidden } from "@mui/utils";
import { brand } from "@/theme-tokens";
import {
  railModel,
  type RailMarker,
  type RailNode,
} from "@/lib/flow/presentation";
import type { OrchestrationState } from "@/lib/orchestrator/types";

/** The glyph a marker draws (numbers are supplied per-node). */
const MARKER_GLYPH: Partial<Record<RailMarker, string>> = {
  done: "✓",
  failed: "!",
  skipped: "–",
  star: "★",
};

/** Marker fill + text colours, all AA against the circle's own background. */
const MARKER_STYLE: Record<
  RailMarker,
  { bg: string; fg: string; border: string }
> = {
  done: { bg: brand.tag.green.fg, fg: "#fff", border: brand.tag.green.fg },
  current: { bg: "#c2561f", fg: "#fff", border: "#c2561f" },
  in_review: { bg: "#c2561f", fg: "#fff", border: "#c2561f" },
  failed: { bg: brand.danger, fg: "#fff", border: brand.danger },
  skipped: { bg: brand.tag.gray.fg, fg: "#fff", border: brand.tag.gray.fg },
  pending: { bg: "transparent", fg: "#5f6675", border: brand.hairline },
  star: { bg: brand.sidebarBg, fg: "#fff", border: brand.sidebarBg },
};

const STAR_PENDING = {
  bg: "transparent",
  fg: "#5f6675",
  border: brand.hairline,
};

function Marker({ node }: { node: RailNode }) {
  const style =
    node.marker === "star" && !node.active
      ? STAR_PENDING
      : MARKER_STYLE[node.marker];
  const glyph = MARKER_GLYPH[node.marker] ?? String(node.index);
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: 30,
        height: 30,
        flexShrink: 0,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        fontWeight: 700,
        lineHeight: 1,
        bgcolor: style.bg,
        color: style.fg,
        border: `2px solid ${style.border}`,
      }}
    >
      {glyph}
    </Box>
  );
}

/**
 * The durable progress rail (AC3/AC5). A semantic ordered list — one `<li>` per node, the active
 * node carrying `aria-current="step"` and a visually-hidden "<label>: <status>" so a screen reader
 * announces the whole run's position. Markers are decorative (`aria-hidden`); the status word is
 * the real text. The model comes from the pure, unit-tested `railModel`.
 */
export default function FlowStepRail({ state }: { state: OrchestrationState }) {
  const nodes = railModel(state);
  return (
    <Box
      component="ol"
      aria-label="Flow progress"
      sx={{
        listStyle: "none",
        display: "flex",
        alignItems: "flex-start",
        gap: { xs: 1, sm: 2 },
        m: 0,
        p: 0,
        overflowX: "auto",
      }}
    >
      {nodes.map((node, i) => (
        <Box
          key={node.key}
          component="li"
          aria-current={node.active ? "step" : undefined}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: { xs: 1, sm: 2 },
            flex: i === nodes.length - 1 ? "0 0 auto" : "1 1 auto",
            minWidth: 0,
          }}
        >
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}
          >
            <Marker node={node} />
            <Box sx={{ minWidth: 0 }}>
              <Typography
                component="span"
                sx={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: node.active ? 700 : 500,
                  color: node.active ? "text.primary" : "text.secondary",
                  whiteSpace: "nowrap",
                }}
              >
                {node.label}
              </Typography>
              <Typography
                component="span"
                aria-hidden="true"
                sx={{
                  display: "block",
                  fontSize: 12,
                  color: "text.secondary",
                  whiteSpace: "nowrap",
                }}
              >
                {node.caption}
              </Typography>
              <Box component="span" sx={visuallyHidden}>
                {node.label}: {node.caption}
              </Box>
            </Box>
          </Box>
          {i < nodes.length - 1 ? (
            <Box
              aria-hidden="true"
              sx={{
                flex: "1 1 auto",
                minWidth: 16,
                height: "2px",
                bgcolor: brand.hairline,
                mx: { xs: 0.5, sm: 1 },
              }}
            />
          ) : null}
        </Box>
      ))}
    </Box>
  );
}
