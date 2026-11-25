"use client";

import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import { brand } from "@/theme-tokens";
import { LIBRARY_TABS, resolveActiveTab } from "@/lib/nav/library-tabs";

/**
 * The Evidence Library's secondary navigation (ADR-0027): a tab bar shown above the
 * Projects / Claims / Learning moments / Sources pages. Each tab is a link to the
 * existing route, so these are navigation links (not an ARIA tab widget): the active
 * one carries `aria-current="page"`. Logic lives in the pure, tested
 * `@/lib/nav/library-tabs`; this is the thin rendering boundary.
 */
export default function EvidenceLibraryTabs() {
  const pathname = usePathname();
  const active = resolveActiveTab(pathname);

  return (
    <Box
      component="nav"
      aria-label="Evidence Library"
      sx={{
        display: "flex",
        gap: 3,
        borderBottom: `1px solid ${brand.hairline}`,
        overflowX: "auto",
      }}
    >
      {LIBRARY_TABS.map((tab) => {
        const isActive = tab.label === active?.label;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            underline="none"
            aria-current={isActive ? "page" : undefined}
            sx={{
              py: 1.5,
              whiteSpace: "nowrap",
              fontSize: 15,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "text.primary" : "text.secondary",
              borderBottom: isActive
                ? `2px solid ${brand.accent}`
                : "2px solid transparent",
              mb: "-1px",
              "&:hover": { color: "text.primary" },
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </Box>
  );
}
